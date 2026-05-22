# linebot-bot

PHP version of the LINE chatbot originally written in Python.

## What it does

- Receives LINE webhook requests
- Verifies the LINE signature
- Sends the user's text to an OpenAI Assistant
- Waits for the assistant response
- Replies back to LINE

## Files

- `index.php` - landing page / health check
- `webhook.php` - LINE webhook endpoint
- `src/Config.php` - loads server-side config
- `src/LineClient.php` - LINE reply + signature verification
- `src/OpenAIClient.php` - OpenAI Assistants API calls

## Server config

Create this file on the server, outside the web root:

`/etc/linebot-bot-config.php`

Example:

```php
<?php
return [
    'openai_api_key' => 'YOUR_OPENAI_API_KEY',
    'assistant_id' => 'YOUR_ASSISTANT_ID',
    'line_channel_secret' => 'YOUR_LINE_CHANNEL_SECRET',
    'line_channel_access_token' => 'YOUR_LINE_CHANNEL_ACCESS_TOKEN',
];
```

If you want to keep a local copy in the repo for development, name it `config.local.php` and point `LINEBOT_BOT_CONFIG` to that path. Do not commit real secrets.

## Deploy location

Recommended web folder:

`/var/www/html/linebot-bot`

Recommended public URL:

`https://taex.openclaw-wo-yo.com/linebot-bot/`

Webhook URL to register in LINE:

`https://taex.openclaw-wo-yo.com/linebot-bot/webhook.php`

## Setup steps

1. Upload the whole `linebot-bot` folder to `/var/www/html/linebot-bot`.
2. Create `/etc/linebot-bot-config.php` with the keys above.
3. Make sure Apache can read the PHP files.
4. Set the LINE webhook URL to `/linebot-bot/webhook.php`.
5. Send a test message to the bot and confirm it replies.

## Notes

- Secrets are loaded from `/etc/linebot-bot-config.php`.
- The repository includes `config.example.php` for placeholders only.
- Real API keys should stay outside GitHub and outside the web root.
- The bot does not store conversation state locally; it creates a fresh thread for each message, just like the Python version.
