# GitNote - Design Document (V1)

## 1. Introduction

*   **App Name:** GitNote
*   **Purpose:** An online WYSIWYG Markdown editor leveraging GitHub as a backend for versioned note-taking. Each save action creates a "draft" corresponding to a Git commit.
*   **Target:** Users who want structured, version-controlled notes accessible online.

## 2. Core Concepts

*   **Backend:** GitHub repository chosen by the user.
*   **Drafts:** Each explicit save action creates a Git commit in the user's repository, representing a draft or version of the note.
*   **Permissions:** A dedicated GitHub App requests fine-grained `contents: write` permission scoped *only* to the user's selected notes repository.
*   **Authentication:** Supabase handles user authentication via its GitHub OAuth provider.

## 3. Technology Stack

*   **Framework:** Next.js 15 (App Router)
*   **UI Library:** React 18
*   **Styling:** Tailwind CSS
*   **Component Library:** shadcn/ui (Zinc theme)
*   **Icons:** lucide-react
*   **Editor:** TipTap (WYSIWYG for Markdown)
*   **State Management:** React Context / Zustand / Server Components (as appropriate)
*   **Authentication:** Supabase Auth
*   **Database:** Supabase Postgres (for metadata/connections)
*   **Analytics:** PostHog
*   **Deployment:** Vercel

## 4. Architecture

*   **Frontend:** Next.js client components, Server Components for data fetching/actions where suitable.
*   **Backend Logic:** Next.js Server Actions handle interactions with Supabase DB and GitHub API.
*   **Authentication Flow:**
    1. User initiates Sign In with GitHub via Supabase client.
    2. Supabase handles OAuth flow.
    3. User session established.
*   **Authorization Flow:**
    1. Post-authentication, check if user has connected a repo (via `user_connections` table).
    2. If not, prompt user to install the GitNote GitHub App and select a repository.
    3. GitHub App installation callback received by a Server Action.
    4. Store `installation_id` and `repository_full_name` in Supabase `user_connections` table, linked to `user_id`.
    5. Subsequent GitHub API calls use installation tokens generated via the stored `installation_id` and the App's private key.
*   **Data Storage:**
    *   Note content: Stored as Markdown files directly in the user's connected GitHub repository.
    *   Metadata: `user_connections` table in Supabase links users to their installation/repo.

## 5. Key Features (V1 Scope)

*   **Authentication:** Sign up/in with GitHub account via Supabase.
*   **GitHub Repository Connection:** Guided flow for installing the GitHub App and selecting the target notes repository.
*   **Notes Page Layout:** Main application interface with a resizable file tree sidebar (left) and editor pane (right) using `shadcn/ui Resizable`.
*   **File Tree:**
    *   Display files/folders from the connected GitHub repository.
    *   Lazy loading of subfolder contents on expansion.
    *   **Create File:** Implemented via `PUT /contents`, prompts for name.
    *   **Create Folder:** Implemented by creating a `.gitkeep` file within the desired folder path.
    *   **Rename File:** Implemented via GitHub API (likely Delete+Create for V1 simplicity, consider Trees API later).
    *   **Delete File:** Implemented via `DELETE /contents`. Requires file SHA.
    *   **Operations Deferred Post-V1:** Folder Deletion, Folder Renaming, Folder Moving.
    *   Uses Optimistic UI for create/delete/rename actions, syncing in the background via Server Actions.
    *   Includes loading states (Skeleton loaders) and empty states.
*   **Editor (TipTap):**
    *   Provides WYSIWYG editing experience for GitHub Flavored Markdown (GFM).
    *   Includes standard toolbar controls (headings, bold, italic, lists, code blocks, inline code, links, blockquotes, horizontal rules).
    *   **Image Handling (V1):** Supports inserting images via external URLs only. No uploads.
    *   **Local Autosave:** Automatically saves current editor content to IndexedDB frequently (debounced).
    *   **Explicit Save ("Save Draft"):**
        *   Dedicated button triggers a modal (`shadcn/ui Dialog`).
        *   Modal prompts user for a custom commit message.
        *   On confirmation, commits current content (with message and SHA for concurrency control) to GitHub via Server Action (`PUT /contents`).
*   **History / Drafts:**
    *   "History" button in editor pane triggers fetching commit history for the current file (`GET /commits?path=...`).
    *   Displays list of commits (custom message, timestamp) in a dropdown/popover.
    *   Selecting a commit transitions editor to read-only "Diff View".
    *   **Diff View:**
        *   Fetches historical content (`GET /contents?ref=...`).
        *   Compares historical vs. current content using `jsdiff`.
        *   Renders historical content in TipTap, highlighting added/deleted lines (requires TipTap customization/Decorations).
        *   Includes clear indicator banner and exit mechanism.
    *   **Export:** Allows exporting the raw Markdown content of any selected historical commit.
*   **Analytics:** PostHog integrated for tracking key user events.

## 6. Data Models

*   **Supabase Table: `user_connections`**
    *   `id` (uuid, PK)
    *   `user_id` (uuid, FK to `auth.users.id`, Unique, Cascade Delete)
    *   `github_installation_id` (bigint, Not Null)
    *   `repository_full_name` (text, Not Null)
    *   `created_at` (timestamptz)
    *   `updated_at` (timestamptz)
    *   Row Level Security (RLS) enabled: Users can only access/manage their own record.
*   **GitHub:** Standard Git repository structure (files, folders, commits).

## 7. User Flows

1.  **Onboarding:** Sign Up/In -> See Prompt -> Connect GitHub Repo (Install App) -> View Notes Page.
2.  **Note Creation:** Click Create File -> Enter Name -> Edit -> Save Draft (Enter Message) -> Commit.
3.  **Note Editing:** Select File -> Edit -> Autosave (Local) -> Save Draft (Enter Message) -> Commit.
4.  **History Viewing:** Select File -> Click History -> Select Commit -> View Diff -> Exit Diff View / Export.

## 8. Error Handling & Edge Cases (V1)

*   Use `shadcn/ui` Toasts for user-facing feedback on errors (API failures, sync issues).
*   Log more detailed errors using PostHog/Sentry (optional).
*   Optimistic UI failures revert UI changes and notify user, preserving local edits where possible (e.g., failed file creation).
*   Check file SHA before saving (`PUT /contents`) to detect external changes. If conflict, notify user (manual resolution for V1).
*   Proactively check for external changes on load/focus (compare latest commit SHA) and prompt user to refresh if needed.

## 9. Loading & Empty States

*   **File Tree Initial Load:** Skeleton loaders mimicking tree structure.
*   **Editor Content Load:** Centered message/spinner within editor pane.
*   **Empty Folder/Repo:** Clear text message (e.g., "Folder is empty").
*   **No File Selected:** Message in editor pane (e.g., "Select or create a note").
*   **No Repo Connected:** Dedicated setup/prompt screen guiding user to connect repository.

## 10. Deployment

*   **Platform:** Vercel.
*   **Process:** Connect project's GitHub repo to Vercel for CI/CD (auto-deploy on main branch pushes, preview deployments for PRs).
*   **Environment Variables:** Securely configure Supabase keys (URL, Anon Key, Service Role Key), GitHub App credentials (App ID, Private Key, Client ID/Secret if needed), PostHog keys, and Application URL in Vercel settings. 