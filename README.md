# falter3d Portfolio

A one-page developer, YouTuber, and editor portfolio built for GitHub Pages. It includes a configurable project system, live Discord presence, responsive layouts, project modals, and a protected visual editor.

## Included

- Public one-page portfolio
- Blue and moon-white visual system using the city background
- Custom cursor and mouse-following glow
- Live Discord presence through Lanyard
- Featured projects and categorized Previous Work
- Search and project filters
- Detailed project modals and image galleries
- Current and Previous experience views
- YouTube channels and embedded videos
- Direct Discord contact controls
- Responsive desktop and mobile layouts
- Reduced-motion support
- Built-in `/admin/` editor
- Save Draft, Preview, and Publish workflow
- Revision history
- Scheduled publishing
- Configurable categories, statuses, tags, sections, roles, links, videos, and administrators
- Discord OAuth access control
- Cloudflare D1 content storage
- Direct image uploads to the GitHub repository

## Architecture

- **GitHub Pages** hosts the public website.
- **Cloudflare Worker** handles the private editor API and Discord sign-in.
- **Cloudflare D1** stores drafts, published content, revisions, schedules, sessions, and administrators.
- **GitHub** stores uploaded images under `assets/uploads/`.
- **Discord OAuth2** verifies the permanent Discord account ID before editor access is granted.

The portfolio does **not** use Cloudflare R2.

## Preview locally

Opening `index.html` directly may block JSON loading in some browsers. Run a small local server instead.

### Windows

Open a terminal in this folder and run:

```powershell
py -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

### macOS or Linux

```bash
python3 -m http.server 8000
```

Without the Cloudflare backend, the editor runs in local mode. Local drafts and previews are stored in that browser only.

## Deploy the public portfolio

1. Open the public repository `falter3d/falter3d.github.io`.
2. Upload everything in this folder to the repository root.
3. Make sure `index.html` is directly in the repository root.
4. In GitHub, open **Settings → Pages**.
5. Choose **Deploy from a branch**, select `main`, and select `/(root)`.
6. Save and wait for GitHub Pages to publish.

The portfolio works immediately from `assets/data/content.json`, even before the live editor is connected.

## Enable the live editor

### Windows

Double-click:

```text
backend\SETUP-WINDOWS.bat
```

### macOS or Linux

```bash
./backend/SETUP-MAC-LINUX.sh
```

The setup wizard will:

1. Sign into Cloudflare.
2. Ask for the GitHub Pages address and repository information.
3. Ask for a repository-limited GitHub token.
4. Ask for Discord OAuth credentials.
5. Create or reuse the D1 database.
6. Apply the database migration.
7. Deploy the Worker.
8. Store the Discord and GitHub secrets in Cloudflare.
9. Update `config.js` with the backend URL.

It does not create or activate R2.

After setup, commit the updated `config.js` and `backend/wrangler.jsonc` files to GitHub. Open `/admin/`, sign in with Discord, and press **Publish** once.

## Create the GitHub image-upload token

Create a **fine-grained personal access token** in GitHub with the smallest possible access:

- Resource owner: your GitHub account
- Repository access: **Only select repositories**
- Selected repository: `falter3d.github.io`
- Repository permission: **Contents — Read and write**
- All other repository permissions: leave at their default level

The setup wizard asks for the token and stores it as the Cloudflare Worker secret `GITHUB_TOKEN`. It is never written to this repository.

You may set an expiration date. When it expires, image uploads stop until the secret is replaced, but the public portfolio and existing images continue working.

## Editor access

The initial owner is tied to Discord user ID:

```text
184491496291041280
```

The editor can be reached through:

- `/admin/`
- The moon button in the footer
- `Ctrl + Shift + E`
- Five quick clicks on the hero profile image

Finding the editor does not grant access. The backend checks the permanent Discord user ID after OAuth sign-in.

## Image uploads

When an authorized administrator uploads an image:

1. The browser sends it to the Cloudflare Worker.
2. The Worker validates the type and size.
3. The Worker commits it to `assets/uploads/YYYY-MM-DD/` in the GitHub repository.
4. The editor stores the resulting GitHub image URL in the project or section.

Supported formats:

- PNG
- JPEG
- WebP
- GIF

Maximum file size: **8 MB per image**.

Each upload creates a Git commit. Uploaded images are not automatically deleted when removed from a project, which prevents accidental broken links. Unused images can be removed manually from `assets/uploads/` later.

## Content controlled by the editor

- Hero and About copy
- Section visibility and order
- Projects, categories, tags, statuses, covers, galleries, links, and ordering
- Featured and Previous Work placement
- Current and Previous experience
- YouTube channels and videos
- Worked With entries
- Skills
- Social links
- Site metadata
- Revision retention
- Administrators and permissions
- Scheduled publication

## Security

Never commit:

- Discord Client Secret
- Fine-grained GitHub token
- Cloudflare API tokens
- `.dev.vars`
- Wrangler authentication files
- Private database exports

The public repository only contains non-sensitive configuration, such as the Discord Client ID, Worker URL, repository name, and owner Discord ID.

## Main file structure

```text
index.html                  Public portfolio shell
config.js                   Public runtime configuration
assets/data/content.json    Bundled fallback content
assets/uploads/             Images uploaded through the editor
assets/css/styles.css       Public design
assets/js/app.js            Public rendering and interactions
admin/                      Protected visual editor
backend/                    Worker, D1, GitHub upload, and OAuth backend
```

## Fallback content

The live D1 version becomes the main content source after the first publish. The bundled JSON remains an emergency fallback:

```text
assets/data/content.json
```

The repository must remain public for the intended GitHub Pages deployment. No private project source code, credentials, runtime databases, or uploaded `.env` files are included.
