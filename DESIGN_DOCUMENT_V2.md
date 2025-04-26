## GitSync - Design Document (V2 - Pivot)

**1. Introduction**

*   **App Name:** GitSync (formerly GitNote)
*   **Purpose:** A web-based utility enabling users to easily synchronize local files to a designated GitHub repository via drag-and-drop. It features automatically generated commit messages based on file diffs using LLM.
*   **Target:** Users needing a simple way to push local file updates or new files to a specific GitHub repo without complex Git commands, benefiting from intelligent commit messages.

**2. Core Concepts**

*   **Drag & Drop:** Users drag files from their local system onto the **File Tree** component in the browser window.
*   **Staging Area:** Dropped files are temporarily "staged" within the application's frontend state, holding their calculated relative path (based on drop target folder) and content.
*   **Unified Commit Trigger:** Pressing `Ctrl+S` (or `Cmd+S`) initiates the commit process for *all* currently staged files.
*   **Diff-Based LLM Commit Message:** Before committing staged files, the app calculates the diff between the staged file content and the current content in the GitHub repository (for existing files). This combined diff is sent to a Google AI model (Gemini) to generate a relevant commit message draft.
*   **Single Atomic Commit:** All staged file changes (creations, updates) are committed to GitHub as a single, atomic commit using the GitHub Git Data API (Blobs, Trees, Commits).
*   **Hybrid UI:** The primary interface features the file tree. The existing editor panel is collapsible (defaults to collapsed) and retains its separate functionality for single-file viewing/editing/saving.

**3. Technology Stack**

*   **Framework:** Next.js 15 (App Router)
*   **UI Library:** React 18
*   **Styling:** Tailwind CSS
*   **Component Library:** shadcn/ui (Zinc theme)
*   **Icons:** lucide-react
*   **Drag & Drop:** `react-dropzone`
*   **State Management:** React `useState`, `useCallback` (for staging, UI state)
*   **Authentication:** Supabase Auth (GitHub Provider)
*   **Database:** Supabase Postgres (`user_connections` table)
*   **GitHub API Client:** `octokit`
*   **Diffing:** `jsdiff` or `diff`
*   **LLM Interaction:** `@google/generative-ai` (via backend API route)
*   **Deployment:** Vercel

**4. Architecture**

*   **Frontend:**
    *   `src/app/notes/page.tsx`: Main client component managing layout, drag-and-drop state *management* (receiving staged files from FileTree), keyboard shortcuts, and orchestrating the drag-and-drop commit workflow.
    *   `src/components/FileTree.tsx`: Modified to act as the **primary drop target**. Calculates relative paths based on drop location (folder or root) and passes staged file data up to `notes/page.tsx`. Continues to display repository contents.
    *   `src/components/CommitMessageModal.tsx`: Modified instance used for the drag-and-drop workflow. Displays staged files and pre-fills with LLM-generated message. (The original instance might still be used by the Editor's save flow).
    *   `src/components/Editor.tsx`: Role minimized in the default view (collapsed), but retains its existing logic for single-file editing and saving via its toolbar.
*   **Backend Logic:**
    *   Next.js API Route (`src/app/api/generate-commit/route.ts`): Securely calls the Google AI API with the diff context to generate a commit message for the staged files. Requires `GOOGLE_API_KEY`.
    *   Next.js Server Actions (`src/lib/actions/githubApi.ts`):
        *   Existing actions (`getFileContent`, `getLatestFileSha`, `checkUserConnectionStatus`, `getUserOctokit`, `saveDraft`) are reused.
        *   **New Action:** `commitMultipleFiles`: Implements the Git Data API flow (Blobs, Trees, Commits, Refs) to commit multiple file changes atomically, triggered by the drag-and-drop workflow.
*   **Authentication:** Supabase handles GitHub OAuth and session management (unchanged).
*   **Authorization:** GitHub App with `contents: write` permission provides access via installation tokens (unchanged flow).
*   **Data Storage:**
    *   File Content: Stored in the user's connected GitHub repository.
    *   Metadata: `user_connections` in Supabase (unchanged).
    *   Temporary Staging (Drag & Drop): Frontend state (`useState`) in `notes/page.tsx`.
    *   Temporary Editor Content (Single File): IndexedDB via Editor component (existing).

**5. Key Features (V2 Scope - Drag & Drop Flow)**

*   **Authentication:** Sign up/in with GitHub via Supabase (existing).
*   **GitHub Repository Connection:** Guided setup flow (existing).
*   **Main Layout:** File tree primary view, collapsible secondary editor panel (modified layout).
*   **File Tree Display:** Show files/folders from the connected repo (existing).
*   **Drag and Drop Staging:** Drop files onto the `FileTree` (folders or root) to stage them. Path calculated relative to drop target.
*   **Staged Files Display:** Visually list files currently staged for the drag-and-drop commit.
*   **Commit Trigger:** `Ctrl+S` / `Cmd+S` initiates commit *only* for staged files from drag-and-drop.
*   **Diff Calculation:** Automatically fetch current file versions and calculate diffs for staged files.
*   **LLM Commit Message:** Call backend API to generate commit message from combined diff using Google AI.
*   **Commit Confirmation Dialog:** Display staged files, LLM-generated message (editable), and confirmation button (specific instance for drag-and-drop).
*   **Atomic Multi-File Commit:** Use Git Data API via `commitMultipleFiles` Server Action.
*   **Basic Feedback:** Loading indicators and toasts for async operations.

*(Note: Existing single-file Editor/Save Draft functionality remains separate)*

**6. Data Models**

*   **Frontend State (`notes/page.tsx`):**
    *   `stagedFiles: Map<string, { content: ArrayBuffer | string }>`: Maps calculated file path (relative to repo root) to its content (read from dropped file).
*   **Supabase Table:** `user_connections` (structure unchanged).
*   **GitHub:** Standard Git repository structure.

**7. User Flows**

1.  **Onboarding:** Sign In -> Connect GitHub App -> Select Repo -> View Main UI (unchanged).
2.  **File Sync (Drag & Drop):**
    *   User drags file(s) from local system onto the **File Tree** (a folder or the root area).
    *   App displays the list of staged files with calculated paths.
    *   User presses `Ctrl+S`.
    *   App fetches current content, calculates diff, calls LLM API.
    *   Commit Dialog appears (specific to this flow), pre-filled with LLM message and staged file list.
    *   User reviews/edits message and confirms.
    *   App executes `commitMultipleFiles` Server Action.
    *   A single commit containing all changes appears in the GitHub repository.
    *   Drag-and-drop staging area is cleared.
3.  **File Editing (Existing):**
    *   User selects file in tree -> Content loads in Editor -> User edits -> User clicks "Save Draft" in Toolbar -> Original Commit Modal appears -> User enters message -> `saveDraft` action commits single file.

**8. API Routes**

*   `POST /api/generate-commit`:
    *   Input: `{ diff: string }`
    *   Output: `{ message: string }` or `{ error: string }`
    *   Requires `GOOGLE_API_KEY` environment variable set on the server.

**9. Error Handling**

*   File reading errors during drag-and-drop.
*   Path calculation errors if drop target is ambiguous.
*   GitHub API errors (fetching content, Git Data API operations).
*   LLM API errors.
*   Network errors.
*   Use toasts for user feedback, log details server-side. Ensure errors in drag-and-drop flow don't block editor flow and vice-versa.

**10. Loading & Feedback States**

*   Visual feedback on drag-over the FileTree.
*   Indicator when files are successfully staged (list updates).
*   Loading state during diff fetch, LLM call, and commit process (specific to drag-and-drop flow).
*   Success/error toasts for the final commit operation.

**11. Deployment**

*   **Platform:** Vercel (unchanged).
*   **Environment Variables:** Add `GOOGLE_API_KEY` (server-side secret). Ensure existing Supabase/GitHub variables are present. 