# crm-prototype

Prototype CRM UI with a lightweight PHP API and MySQL-backed persistence.

## Files

- `index.html` - main frontend
- `api.php` - JSON API used by the frontend

## How it works

The frontend calls `/api.php` for two actions:

- `action=bootstrap` to load saved customer data
- `action=save` to persist customer data and UI state

Data is stored in MySQL through a small `crm_state` table.

## Requirements

- PHP 8.x
- MySQL or MariaDB
- Apache or Nginx with PHP support

## Local setup

1. Copy the project files to your web root.
2. Make sure `api.php` is reachable at `/api.php`.
3. Create a database for the app.
4. Create a server-side config file at `/etc/crm-prototype-db.php` with these constants:

```php
<?php
define('CRM_DB_DSN', 'mysql:host=127.0.0.1;dbname=crm_prototype;charset=utf8mb4');
define('CRM_DB_USER', 'your_db_user');
define('CRM_DB_PASS', 'your_db_password');
```

5. Open the site in your browser.

## Database setup

The first request to `api.php` will create the `crm_state` table automatically.

If you want to create the database manually, run something like:

```sql
CREATE DATABASE crm_prototype CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Then grant the app user access to that database.

## Production deploy

1. Upload `index.html` and `api.php` to the server web root.
2. Point the web server document root to the folder that contains those files.
3. Create `/etc/crm-prototype-db.php` on the server.
4. Confirm the site can reach MySQL.
5. Visit the site and verify save/load works.

## GitHub push

If the repository is not initialized yet:

```bash
git init
git branch -M main
git remote add origin https://github.com/Taex3/web-with-openclaw.git
git add index.html api.php README.md
git commit -m "Add CRM prototype and deployment notes"
git push -u origin main
```

If `origin` already exists:

```bash
git remote set-url origin https://github.com/Taex3/web-with-openclaw.git
git add index.html api.php README.md
git commit -m "Add CRM prototype and deployment notes"
git push -u origin main
```

## Notes

- The app uses a server-side MySQL database, not browser `localStorage`.
- Keep the DB config file outside the repository.
- Do not commit secrets to GitHub.
