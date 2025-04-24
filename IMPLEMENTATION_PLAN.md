# GitNote - Implementation Plan (V1)

This document outlines the step-by-step process to build GitNote V1 based on the `DESIGN_DOCUMENT.md`, ensuring alignment with all discussed decisions.

## Phase 1: Setup & Core Foundations

1.  **Initialize Next.js Project (v14):**
    *   Action: Create a new Next.js project explicitly using **Next.js 14** to ensure **React 18** compatibility. Use `npx create-next-app@14`.
    *   Configuration: Select options for TypeScript, Tailwind CSS, App Router during setup.
    *   Result: Basic Next.js 14 project structure using React 18.
    *   Verification:
        *   Run `npm run dev` (or `yarn dev`).
        *   Open the browser to the local development URL.
        *   Verify the default Next.js welcome page loads without errors.
        *   Check `package.json` to confirm `next` version is `14.x.x` and `react` version is `18.x.x`.
        *   Run `npm run lint`. Verify it passes without errors (or only shows expected initial warnings).

2.  **Install Core Dependencies:**
    *   Action: Install necessary npm packages.
    *   Packages: `shadcn-ui`, `lucide-react`, `@supabase/supabase-js`, `@supabase/ssr` (for server-side auth helpers), `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit` (confirm specific extensions needed for GFM later), `jsdiff` (for history diffing), `octokit` (for GitHub API interaction), `jsonwebtoken` (for generating GitHub App JWTs), `posthog-js` / `posthog-node` (confirm which based on integration strategy), `idb-keyval` (for easier IndexedDB access for autosave).
    *   Configuration: Initialize `shadcn-ui` (`npx shadcn-ui@latest init`), select **Zinc** theme as specified. Add necessary `shadcn/ui` components as needed (e.g., `button`, `dialog`, `toast`, `popover`, `resizable`, `dropdown-menu`, `alert-dialog`, `input`, `skeleton`).
    *   Result: Project dependencies installed and `shadcn-ui` configured with the Zinc theme.
    *   Verification:
        *   Check `package.json` to confirm all listed packages are present under dependencies.
        *   Check `tailwind.config.js` and `globals.css` for `shadcn/ui` theme configurations (Zinc theme variables).
        *   Run `npm run dev` again and check for any build errors related to dependencies.
        *   Try importing and rendering a simple `shadcn/ui` component (e.g., `Button`) on the homepage to verify setup.
        *   Run `npm run lint`. Verify no new errors were introduced.

3.  **Setup Supabase:**
    *   Action: Create a Supabase project via the Supabase dashboard.
    *   Configuration:
        *   Enable the **GitHub Auth provider** in Supabase Authentication -> Providers settings. Note the redirect URL needed.
        *   Record Supabase Project URL and Anon Key (public).
        *   Securely store the Service Role Key (secret).
    *   Action: Create the `user_connections` table in the Supabase SQL Editor exactly as defined in `DESIGN_DOCUMENT.md`, including `user_id` unique constraint, foreign key to `auth.users`, and RLS policies granting users access only to their own records.
    *   Result: Supabase project ready, GitHub auth enabled, `user_connections` table created with RLS.
    *   Verification:
        *   Log in to Supabase dashboard.
        *   Verify the project exists.
        *   Navigate to Authentication -> Providers, confirm GitHub is enabled and configured.
        *   Navigate to Table Editor, confirm the `user_connections` table exists with the correct columns (`id`, `user_id`, `github_installation_id`, `repository_full_name`, `created_at`, `updated_at`), types, and foreign key constraint to `auth.users`.
        *   Navigate to Authentication -> Policies, confirm the `user_connections` table has RLS enabled and the defined policies exist.
        *   Run `npm run lint`. Verify no errors (this step primarily involves external setup).

4.  **Setup GitHub App:**
    *   Action: Create a new GitHub App under a personal or organization account.
    *   Configuration:
        *   Permissions: Request **Repository permissions -> Contents: Read & write**.
        *   **Crucial:** Check the box for **"Request user authorization (OAuth) during installation"**.
        *   User authorization callback URL: Set this to `[YOUR_APP_URL]/auth/callback`. This URL handles both the OAuth code exchange and receives installation details when the OAuth box is checked.
        *   Setup URL: This field will be **disabled** when the OAuth box is checked; ignore it. The callback URL handles the necessary post-installation actions.
        *   Webhooks: Deactivate webhook unless needed later.
        *   Generate & Store Credentials: Generate a Private Key (.pem file, store securely). Note the App ID, Client ID, and generate/note a Client Secret (store securely).
    *   Result: GitHub App created, configured for OAuth during installation, correct permissions set, credentials obtained.
    *   Verification:
        *   Log in to GitHub -> Settings -> Developer settings -> GitHub Apps.
        *   Verify the app exists.
        *   Review app settings: Confirm name, description, homepage URL.
        *   Check "Identify and authorize users" section: Confirm **"Request user authorization (OAuth) during installation" is checked** and the **"User authorization callback URL"** is correct.
        *   Check Permissions & events: Confirm `Contents: Read & write` is set under Repository permissions.
        *   Confirm you have securely saved the App ID, Client ID, Client Secret, and the downloaded Private Key file.
        *   Run `npm run lint`. Verify no errors (this step primarily involves external setup).

5.  **Environment Variables Setup:**
    *   Action: Create `.env.local` file (add to `.gitignore`).
    *   Variables: Add all required variables as keys: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY` (handle multiline PEM), `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`, `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`, `APP_BASE_URL` (your deployment URL).
    *   Action: Populate `.env.local` with development values.
    *   Result: Local environment configured for running the application.
    *   Verification:
        *   Confirm `.env.local` exists in the project root.
        *   Confirm `.env.local` is listed in `.gitignore`.
        *   Briefly check (without printing sensitive values) that all necessary keys are present in `.env.local` and populated.
        *   Try accessing a public variable (e.g., `process.env.NEXT_PUBLIC_SUPABASE_URL`) in a test component and logging it to the browser console to ensure it's accessible.
        *   Run `npm run lint`. Verify no errors.

## Phase 2: Authentication & Authorization

6.  **Implement Supabase Auth Flow & Initial Installation Capture:**
    *   Action: Create Supabase client instances using `@supabase/ssr` helpers (for Server Components, Client Components, Route Handlers, Server Actions) as per Supabase documentation for Next.js App Router. Place in `lib/supabase/`.
    *   Action: Implement Sign In page/component (`/login` or root).
        *   UI: Use `shadcn/ui Button` with text "Sign in with GitHub".
        *   Logic: On click, call server-side `signInWithOAuth` from `@supabase/ssr` helper, specifying `provider: 'github'`.
    *   Action: Implement Auth Callback Route Handler (`/auth/callback/route.ts`).
        *   Use `@supabase/ssr` `createClient` for Route Handlers.
        *   Call `exchangeCodeForSession` with the received `code` parameter to establish the Supabase session.
        *   **Check for Installation Parameters:** After successful session exchange, check if the URL query parameters include `installation_id` and `setup_action=install`. These indicate the callback is the result of a new app installation.
        *   **Save Initial Connection:** If installation parameters are present, get the `user_id` from the newly created session. Use a Supabase client (server role or appropriate RLS bypass if needed for backend logic) to `insert` a new record into `user_connections` containing the `user_id` and `installation_id`. **Do not save `repository_full_name` yet.** Handle potential errors (e.g., user already has a connection record, though `upsert` might be safer).
        *   Redirect user to `/notes` upon successful session creation (and potential initial connection save).
    *   Action: Implement Sign Out functionality (e.g., in a user dropdown). Call server-side `signOut` action.
    *   Action: Protect the `/notes` page and potentially API routes/Server Actions using Supabase session checks. Redirect unauthenticated users to the Sign In page.
    *   Result: Robust user authentication via GitHub handled by Supabase, with initial capture of installation ID upon first app install.
    *   Verification:
        *   Navigate to the Sign In page. Click the "Sign in with GitHub" button. Verify redirection to GitHub authorization screen. Authorize the app. Verify redirection back to `/auth/callback` and then automatically to `/notes`. Check Supabase Users table.
        *   **New User Installation:** Sign out. Delete the user from Supabase Auth and any related row in `user_connections`. Go to GitHub settings and uninstall the app. Click "Sign in with GitHub" again. Go through the GitHub install & authorize flow. Verify redirection to `/auth/callback` and then `/notes`. Check `user_connections` table: verify a row exists with the correct `user_id` and `github_installation_id`, but `repository_full_name` is likely NULL or empty.
        *   Implement and click Sign Out. Verify redirection to Sign In page.
        *   Try accessing `/notes` directly while signed out (should redirect to Sign In).
        *   Run `npm run lint`. Check the updated callback logic.

7.  **Implement Connection & Repository Status Check:**
    *   Action: Create/Update Server Action `checkUserConnectionStatus()` in `lib/actions/githubConnections.ts`.
        *   Input: None (uses Supabase auth context).
        *   Logic: Create Supabase server client, get `user_id`. Query `user_connections` table for `installation_id` and `repository_full_name` where `user_id` matches.
        *   Output: An object indicating status, e.g., `{ status: 'NO_CONNECTION' | 'CONNECTION_NO_REPO' | 'CONNECTED', installationId?: number, repoFullName?: string }`.
    *   Action: In the main layout or `/notes` page server component:
        *   Check if user is authenticated. Redirect to `/login` if not.
        *   Call `checkUserConnectionStatus()`.
        *   Conditionally render UI based on the status:
            *   `'NO_CONNECTION'`: Render `ConnectRepoPrompt` component.
            *   `'CONNECTION_NO_REPO'`: Render `SelectRepoPrompt` component (passing `installationId`).
            *   `'CONNECTED'`: Render the main application UI (File Tree + Editor layout).
    *   Action: Create `ConnectRepoPrompt` component (`components/ConnectRepoPrompt.tsx`).
        *   UI: Display text explaining the need to connect a repo. Include a `shadcn/ui Button` linking to the GitHub App installation URL (`https://github.com/apps/YOUR_APP_NAME/installations/new`).
    *   Action: Create placeholder `SelectRepoPrompt` component (`components/SelectRepoPrompt.tsx`). This will be implemented in the next step.
    *   Result: Application correctly routes users based on their connection and repository selection status.
    *   Verification:
        *   **No Connection:** Sign in as a new user who hasn't installed the app (or delete `user_connections` record). Navigate to `/notes`. Verify the `ConnectRepoPrompt` is displayed with the correct link.
        *   **Connection, No Repo:** Sign in as a user who has installed the app but hasn't selected a repo (simulate by ensuring `repository_full_name` is null in `user_connections` after Step 6 verification). Navigate to `/notes`. Verify the placeholder `SelectRepoPrompt` is displayed.
        *   **Connected:** Ensure a user has a complete `user_connections` record (manually add repo name for now, or complete the next step). Navigate to `/notes`. Verify the main app UI (placeholder layout from Step 8) is displayed.
        *   Run `npm run lint`. Check the new Server Action and prompt components.

8.  **Implement Repository Selection:**
    *   Action: Implement the `SelectRepoPrompt` component (`components/SelectRepoPrompt.tsx`).
    *   Input Props: Requires `installationId`.
    *   Data Fetching:
        *   Use `useEffect` to call a new Server Action `getInstallationRepositories(installationId)`.\
        *   `getInstallationRepositories` Action: Uses `getAppOctokit()` (from Step 9) to get an app-level token, then calls `GET /user/installations/{installation_id}/repositories`. Handle pagination if necessary (though unlikely for initial install). Return the list of repositories (`{ id, full_name }`).
    *   UI:
        *   Display loading state while fetching. Handle errors fetching repositories.
        *   Display text: "Select the repository you want to use with GitNote:".
        *   Render a list (e.g., radio buttons or a select dropdown using `shadcn/ui`) of the fetched repositories (`repository.full_name`).
        *   Include a "Confirm Repository" `shadcn/ui Button`.
    *   State: Manage selected repository `full_name`.
    *   Action: On "Confirm Repository" click, call a new Server Action `saveRepositorySelection(installationId, repoFullName)`.\
        *   `saveRepositorySelection` Action: Create Supabase server client, get `user_id`. Update the existing `user_connections` record for the `user_id`, setting the `repository_full_name` to the selected value. Ensure the update query also checks the `installationId` matches for safety.
    *   Result: Users who have installed the app can select the specific repository they want to manage. Application state updates to `'CONNECTED'`.
    *   Verification:
        *   Ensure you have installed the GitHub App on at least one repository (ideally 2+ for testing selection).
        *   Sign in as the user who performed the installation. Navigate to `/notes`. Verify the `SelectRepoPrompt` is shown.
        *   Verify a loading indicator appears, then a list of repositories you granted access to during installation is displayed.
        *   Select a repository and click "Confirm Repository".
        *   Verify the UI updates to show the main application layout (the prompt disappears).
        *   Check the `user_connections` table in Supabase. Verify the `repository_full_name` column for that user is now populated with the selected repository's name.
        *   Refresh the `/notes` page. Verify it loads directly into the main application UI.
        *   Run `npm run lint`. Check the new components and Server Actions.

## Phase 3: Core Application UI & Editor

9.  **Implement Notes Page Layout:**
    *   Action: Structure the `/notes/page.tsx`. Ensure it's protected and handles the connection status checks (displaying `ConnectRepoPrompt`, `SelectRepoPrompt`, or the main UI).
    *   UI: Use `shadcn/ui Resizable` (`ResizablePanelGroup`, `ResizablePanel`, `ResizableHandle`) to create the two-pane layout (default sizes, e.g., 25%/75%) for the main application view.
    *   Components: Create placeholders `FileTree` and `Editor` components to place within the resizable panels when the status is `'CONNECTED'`.
    *   Result: Main application layout with resizable sidebar and editor area, conditionally rendered based on setup status.
    *   Verification:
        *   Sign in as a user who *has* connected and selected their repository.
        *   Navigate to `/notes`.
        *   Verify the two-panel layout appears.
        *   Verify the placeholder text/components for `FileTree` and `Editor` are visible in their respective panels.
        *   Test resizing the panels using the handle. Verify it works smoothly.
        *   Run `npm run lint`. Check the updated page (`/notes/page.tsx`) and placeholder components.

10. **Implement GitHub API Client/Helpers:**
    *   Action: Create `lib/github.ts`.
    *   Helper 1: `generateJwt()`: Creates the JWT needed to authenticate as the GitHub App using `jsonwebtoken` and the App ID / Private Key.
    *   Helper 2: `getAppOctokit()`: Returns an `octokit` instance authenticated as the GitHub App using the JWT. (Used in Step 8)
    *   Helper 3: `getInstallationAccessToken(installationId)`: Uses the App Octokit to call `POST /app/installations/{installation_id}/access_tokens`, returns the installation token.
    *   Helper 4: `getUserOctokit(userId)`: Primary helper for Server Actions. Gets `user_id`, calls `checkUserConnectionStatus` to get `installationId`, calls `getInstallationAccessToken`, returns a new `octokit` instance authenticated with this installation token. Handle errors if user/installation/repo not found or status is not `'CONNECTED'`.
    *   Action: Create `lib/actions/githubApi.ts` containing Server Actions (e.g., `getFileTree`, `getFileContent`, `createOrUpdateFile`, `deleteFileFromRepo`, `getCommitsForFile`). These actions will use `getUserOctokit` internally.
    *   Result: Secure and reusable mechanism for backend GitHub API interactions scoped to the user's installation and selected repository.
    *   Verification:
        *   This step is primarily backend logic. Manual testing involves verifying *later* steps that *use* these helpers.
        *   Add extensive logging within these helper functions during development.
        *   Optionally, create a temporary test Server Action that calls `getUserOctokit` and attempts a simple read operation (like fetching repo root contents using the selected repo) and log the result or display it on a test page. Ensure it fails correctly if called by a user whose status isn't `'CONNECTED'`.
        *   Run `npm run lint`. Thoroughly check `lib/github.ts` and `lib/actions/githubApi.ts` for type safety.

11. **Implement File Tree Display:**
    *   Action: Develop the `FileTree` client component (`components/FileTree.tsx`).
    *   State: Use `useState` for tree data, expanded folders, selected file path, loading/error states.
    *   Data Fetching: Use `useEffect` to call the `getFileTree(path)` Server Action on mount and when expanding folders. The Server Action uses `getUserOctokit` (which now implicitly uses the selected repo) and calls `GET /repos/{owner}/{repo}/contents/{path}`.
    *   UI Rendering:
        *   Recursively render file/folder items (use icons from `lucide-react`).
        *   Implement click handlers for file selection (update parent state) and folder expansion (toggle state, fetch data).
        *   Integrate `shadcn/ui Skeleton` for loading state.
        *   Display "Folder is empty" message when applicable.
    *   Result: Interactive file tree reflecting the connected and selected repository structure.
    *   Verification:
        *   Sign in, connect, and select a repository with files/folders. Navigate to `/notes`.
        *   Verify the `FileTree` component displays the files and folders from the root of your selected repository.
        *   Verify Skeleton loaders appear briefly during the initial load.
        *   Click on a folder. Verify it expands and shows its contents.
        *   Click on a file. Verify it gets highlighted.
        *   Test with an empty selected repository. Verify empty state message.
        *   Run `npm run lint`. Check the `FileTree` component.

12. **Implement Basic TipTap Editor:**
    *   Action: Develop the `Editor` client component (`components/Editor.tsx`).
    *   TipTap Setup: Use `@tiptap/react`'s `useEditor` hook. Configure with `@tiptap/starter-kit` and potentially specific extensions for GFM compatibility (e.g., `Table`, `TaskList`, `Link`, `Highlight`).
    *   UI: Render `EditorContent` for the editing surface. Create a `Toolbar` component with `shadcn/ui Button` / `Toggle` elements triggering TipTap commands (e.g., `editor.chain().focus().toggleBold().run()`).
    *   State: Manage loading/empty states within the editor pane. Display centered message/spinner for loading. Display "Select or create a note" when no file is selected.
    *   Result: Functional WYSIWYG editor ready to load/save content.
    *   Verification:
        *   Sign in and navigate to the main app UI in `/notes`.
        *   Verify the editor pane shows the "Select or create a note" message initially.
        *   Verify the editor toolbar is visible.
        *   Select a file in the tree (content loading isn't implemented yet, but the empty state should disappear).
        *   Type some text in the editor area. Use the toolbar buttons. Verify formatting changes.
        *   Run `npm run lint`. Check `Editor` and `Toolbar`.

13. **Implement Editor Content Loading:**
    *   Action: Enhance `Editor` component to accept the selected file path and SHA as props (or via context/state manager).
    *   Logic: When the selected file path changes:
        *   Set loading state to true.
        *   Call Server Action `getFileContent(filePath)` (which uses `getUserOctokit` and `GET /repos/.../contents/{path}`). This action should return both content (decoded from Base64) and the file's SHA.
        *   On success, update TipTap content using `editor.commands.setContent(content)` and store the received SHA in component state.
        *   Set loading state to false. Handle errors with Toasts.
    *   Result: Editor loads and displays content when a file is selected in the tree.
    *   Verification: Ensure your selected test repository has at least one Markdown file. Sign in. Navigate to `/notes`. Select the Markdown file. Verify loading indicator and then content appears in TipTap. Select a different file. Verify its content loads. Run `npm run lint`. Check `Editor` component logic.

14. **Implement Local Autosave (IndexedDB):**
    *   Action: In the `Editor` component, add an `onUpdate` handler to the `useEditor` configuration.
    *   Logic: Inside `onUpdate`:
        *   Debounce the execution.
        *   Inside the debounced function, use `idb-keyval`'s `set(currentFilePath, editor.getHTML())` (or `.getText()`) to save content.
    *   Action: Modify content loading logic (Step 13) to check `idb-keyval` *after* a failed GitHub fetch (useful for offline), or *before* GitHub fetch (optional optimization, increases complexity).
    *   **Refinement (Handling New Files):** Modify the `Editor`'s loading logic (Step 13) further. If the `selectedFilePath` prop comes with an `isNew: true` flag (passed from `FileTree` after optimistic creation in Step 15):
        *   **Skip** the initial `getFileContent` server action call.
        *   Set editor content to empty (`editor.commands.clearContent()`).
        *   Enable editing (`editor.setEditable(true)`).
        *   **Initialize IndexedDB entry:** Immediately call `idb-keyval.set(newFilePath, '')` to create the local record for autosave.
    *   Result: Frequent local backups of user edits. Seamless immediate editing for newly created files without initial server errors.
    *   Verification: Sign in, load file, make edits. Wait past debounce. Check IndexedDB in browser dev tools for the key/value. Refresh page, verify GitHub version loads (unless IndexedDB load implemented). **Test New File:** Create a new file, verify editor opens immediately with no error, type content, check IndexedDB. Run `npm run lint`. Check autosave logic and new file handling.

15. **Implement File Tree CRUD Actions (Optimistic UI):**
    *   Action: Add UI triggers in `FileTree` (e.g., "+" buttons, right-click context menu using `shadcn/ui DropdownMenu`).
    *   **Create File:**
        *   UI: Use `shadcn/ui Dialog` + `Input`.
        *   Optimistic UI: Add file to tree state (pending/final state).
        *   Server Action: `createOrUpdateFile(filePath, '', 'Create file [name]')`. Uses `getUserOctokit`.
        *   Callback: Update tree state (e.g., add SHA) or show error Toast and revert optimistic UI.
        *   **Editor Interaction:** Pass `isNew: true` flag to parent when selecting the optimistically created file (See Step 14 refinement).
    *   **Create Folder:** Similar, Server Action creates `filePath + '/.gitkeep'`. Optimistic UI adds folder to tree.
    *   **Delete File:**
        *   UI: `shadcn/ui AlertDialog` + Context Menu.
        *   Optimistic UI: Remove file from tree.
        *   Server Action: `deleteFileFromRepo(filePath, fileSha)`. Requires SHA. Uses `getUserOctokit`.
        *   Callback: Show Toast, revert UI on error.
    *   **Delete Folder:** (See details below - V1 might be limited)
        *   UI: Add to Context Menu.
        *   Logic: Check if folder is empty (requires fetching children if not cached). If empty, call server action to delete `.gitkeep` file (if exists) or handle via Git Data API if needed. If not empty, disable delete or show error.
        *   Optimistic UI: Remove folder from tree.
        *   Server Action: `deleteFile` targeting `.gitkeep` or more complex action.
        *   Callback: Show Toast, revert UI on error.
    *   **Rename File:** (V1: Delete+Create)
        *   UI: Dialog.
        *   Optimistic UI: Update path in tree.
        *   Server Action: `renameFile(oldPath, newPath, sha)`. Internally uses `getUserOctokit` to get content, delete old, create new. Needs careful error handling.
        *   Callback: Update UI based on success/failure.
    *   Result: File management integrated with optimistic updates.
    *   Verification: Test Create, Create Folder, Delete (File), Rename. Check optimistic UI works. Check GitHub repo reflects changes. Test error handling (e.g., create existing file). Run `npm run lint`.

## Phase 4: File Operations & Saving

16. **Implement "Save Draft" (Commit):**
    *   Action: Add "Save Draft" `shadcn/ui Button` in `Editor` toolbar.
    *   Action: Create `CommitMessageModal` component (`shadcn/ui Dialog`, `Input`, `Button`).
    *   Logic:
        *   Button opens modal.
        *   Modal submit gets message, editor content, stored file SHA.
        *   Call Server Action `saveDraft(filePath, commitMessage, content, sha)`.
        *   `saveDraft` calls `createOrUpdateFile(filePath, content, commitMessage, sha)`.
        *   `createOrUpdateFile` uses `getUserOctokit`, calls `PUT /repos/.../contents/{path}` including `message`, `content` (Base64), `sha`.
        *   Client: Handle loading. On success, update stored SHA, show success Toast. On specific 409 conflict error, trigger conflict UI (Step 17). Show error Toast otherwise.
    *   Result: Explicit saving with commit messages.
    *   Verification: Load file, make changes, click Save Draft, enter message. Verify loading/success Toast. Check GitHub commit history for the file. Verify editor shows saved version. Run `npm run lint`.

17. **Implement Conflict Handling (V1 - Manual):**
    *   Action: Ensure `createOrUpdateFile` catches 409 errors and returns specific indication.
    *   Action: Client `saveDraft` call checks for this conflict error.
    *   UI: If conflict, show persistent `Toast`/`AlertDialog`: "Conflict detected... copy work, refresh, re-apply."
    *   Action: Proactive check: On editor load (Step 13) / window focus, call a lightweight Server Action `getLatestFileSha(filePath)`. If different from stored SHA (and content not dirty), prompt "External changes detected. Refresh file?".
    *   Result: Informs user about conflicts for manual resolution.
    *   Verification: Simulate conflict (edit on GitHub, then try saving different change in GitNote). Verify conflict message. Simulate proactive check (edit on GitHub, reload/refocus GitNote). Verify refresh prompt. Run `npm run lint`.

## Phase 5: History & Final Touches

18. **Implement History Feature - UI & Fetching:**
    *   Action: Add "History" `shadcn/ui Button` near "Save Draft".
    *   Action: Create `HistoryPopover` component (`shadcn/ui Popover` or `DropdownMenu`).
    *   Logic: Button click opens popover. `useEffect` calls Server Action `getCommitsForFile(filePath)`.
    *   Server Action: Uses `getUserOctokit`, calls `GET /repos/.../commits?path={filePath}`. Format results.
    *   UI: Render list of commits in popover. Include loading/error states.
    *   Result: History dropdown populated with commits.
    *   Verification: Ensure file has multiple commits via GitNote. Load file, click History. Verify popover opens with commit list and timestamps. Verify loading state. Run `npm run lint`.

19. **Implement Diff View:**
    *   Action: Handle commit selection in `HistoryPopover`. Update app state (`viewMode: 'diff'`, `diffCommitSha: selectedSha`).
    *   Action: Modify `Editor` to react to `viewMode`.
        *   If `'diff'`, set `editor.setEditable(false)`.
        *   Display banner: "Viewing history... Read-only." Include "Exit Diff View" button.
        *   Fetch historical content: `getFileContent(filePath, diffCommitSha)`.
        *   Fetch current content: `getFileContent(filePath)`.
        *   Diffing: `jsdiff.diffLines(historicalContent, currentContent)`.
        *   Rendering: Use TipTap Decorations API. Iterate diff results, create Decorations for added/removed blocks (red/green background). Load *historical* content into read-only editor.
    *   Action: Implement "Exit Diff View" button logic (reset state, set editable, reload current content).
    *   Result: Read-only view showing line-level changes from a past commit.
    *   Verification: Select file with changes between commits. Open History, select older commit. Verify read-only state, banner, historical content. Verify added lines (green) / removed lines (red). Click Exit Diff View, verify return to editable state with current content. Run `npm run lint`, focus on diff logic and Decorations.

20. **Implement History Export:**
    *   Action: Add export icon/button (`lucide-react`) next to each commit in `HistoryPopover`.
    *   Logic: On click, call `getFileContent(filePath, commitSha)` Server Action.
    *   Client: Take raw content, create Blob, generate download link, trigger download as `[filename]-[sha_short].md`.
    *   Result: Ability to download historical versions.
    *   Verification: Open History popover. Click export icon. Verify file download with correct name. Open file, verify content matches that commit. Run `npm run lint`.

21. **Integrate Analytics (PostHog):**
    *   Action: Set up PostHog provider (`app/providers.tsx`). Initialize `posthog-js`.
    *   Action: Add `posthog.capture()` calls (login, connect repo, select repo, create file, save draft, view history, etc.). Use `posthog-node` in Server Actions if needed.
    *   Result: Analytics tracking enabled.
    *   Verification: Perform key actions. Check PostHog dashboard for events (`login`, `repo_connected`, `repo_selected`, `file_created`, `draft_saved`, `history_viewed`). Run `npm run lint`.

22. **Refine Loading/Empty/Error States:**
    *   Action: Thoroughly review UI.
    *   Checklist: `Skeleton` for file tree, spinners for editor load, clear text for empty states (tree, editor), ensure `ConnectRepoPrompt` and `SelectRepoPrompt` are clear, `Toast` used consistently.
    *   Result: Polished UX handling various states.
    *   Verification: Trigger loading states (slow network sim?). Trigger empty states (empty repo, folder, no file). Trigger errors (conflict (step 17), API errors). Verify prompts guide user correctly. Run `npm run lint`.

## Phase 6: Deployment & Testing

23. **Configure Vercel Deployment:**
    *   Action: Create Vercel project, link repo.
    *   Action: Configure env vars in Vercel settings (incl. production GitHub App credentials and multi-line key).
    *   Action: Ensure build command/preset correct. Trigger deployment.
    *   Result: CI/CD pipeline, application deployed.
    *   Verification: Push changes, verify Vercel build success. Access deployment URL. Verify core functionality (login, connect, select repo) works. Check logs. Run `npm run build` locally. Run `npm run lint`.

24. **Testing & Bug Fixing:**
    *   Action: Systematically test all user flows on deployed env.
    *   Focus Areas: Auth redirects, GitHub connection & repo selection, file ops (optimistic UI, errors), saving, conflicts, history, diff accuracy.
    *   Action: Test cross-browser, basic responsiveness.
    *   Action: Log bugs, prioritize, fix critical issues.
    *   Result: Stable V1 release.
    *   Verification: Execute verification steps from previous points (#6 through #22) on deployed env. Perform exploratory testing. Test responsiveness. Confirm no critical bugs remain. Run `npm run lint`.

This revised plan explicitly uses Next.js 14 / React 18, reflects the consolidated GitHub App callback flow, includes repository selection, and adds more granular details about the components, libraries, API calls, and logic involved in each step, drawing directly from our discussion.

This plan provides a detailed roadmap. Each numbered item represents a logical chunk of work, often corresponding to specific components or features. 