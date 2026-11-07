# Learnly admin

The admin page is at **https://learnly.space/admin/**. Use it to add, edit, hide, reorder and delete teachers, courses and exams. There's no server: changes are saved as a commit to this repository, and GitHub Pages updates the site in 1–2 minutes.

## One-time setup (repository owner)

1. In `admin/config.js`, set `owner` to your GitHub username (or organization). Check `repo` and `branch`.
2. If the admin isn't the repository owner, add them under **Settings → Collaborators → Add people**.

## First sign-in on a device

1. Create a GitHub token at https://github.com/settings/personal-access-tokens/new
   - **Repository access** → *Only select repositories* → the website repository
   - **Permissions → Repository permissions → Contents → Read and write** (nothing else)
2. Open `/admin/`, paste the token, and choose a **username** and **password** (at least 10 characters).

From then on, sign in on that device with just your username and password.

### How the sign-in works

- The token is stored **encrypted** in this browser. The key comes from your username and password, so without them the stored data is useless.
- After you sign in, the decrypted token is kept only in the current tab and is gone when the tab closes.
- After 5 wrong passwords, sign-in pauses for 30 seconds, doubling each time.
- **Each device is set up separately** (computer, phone). The token is never stored in the repository.
- **Forgot your password?** Click “Forgot your password or need a new GitHub token?” and enter the token again. The token itself still works; you can also create a new one.
- **Token expired or deleted?** The admin page notices this and asks for a new token, keeping your username.

## Editing

- Every change goes into a **draft** first. The site doesn't change until you click **Publish**.
- Texts are entered in 3 languages (EN / RU / AR). The dot on a language tab is green when complete and yellow when partly filled. Any empty field shows the English text on the site.
- **Hide on the site** removes a card from the site but keeps it in the admin — useful for holidays.
- Photos are cropped to a square and resized to 640×640 automatically.
- If two people edit at the same time, the second one gets a warning instead of overwriting the first.

## Undoing a change

Each publish is a separate commit named “Admin: …”. To undo one, open it on GitHub (**Commits** → the commit → **Revert**).

## Where the data lives

- `data/teachers.json` — teachers
- `data/courses.json` — courses and exams
- `img/teachers/` — teacher photos
