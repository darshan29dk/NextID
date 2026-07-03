# Custom Rules for rAnalyzer

## Git Pushes
- Whenever the user requests to push changes to GitHub, always ensure the `backend/.env` file is pushed as well.
- Since `backend/.env` is ignored by default in `.gitignore`, use `git add -f backend/.env` to force add it before committing and pushing.
