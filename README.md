# Dark Web Crawler

A Node.js/TypeScript project to scrape escort data from websites and save to CSV and Google Sheets.

## Prerequisites

- Node.js (version 18 or higher)
- npm or yarn
- Google Cloud Project with Sheets API enabled

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/thanhngochoang/crawl-dark-web.git
cd crawl-dark-web
```

### 2. Install dependencies

```bash
npm install
```

### 3. Get Google Credentials

#### Create a Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project or select an existing one.
3. Enable the Google Sheets API:
   - Go to "APIs & Services" > "Library".
   - Search for "Google Sheets API" and enable it.

#### Create a Service Account
1. Go to "APIs & Services" > "Credentials".
2. Click "Create Credentials" > "Service Account".
3. Fill in the details and create the account.
4. After creation, click on the service account email.
5. Go to the "Keys" tab.
6. Click "Add Key" > "Create new key" > JSON.
7. Download the JSON file - this is your `credentials.json`.

#### Share Google Sheet with Service Account
1. Create a new Google Sheet or use an existing one.
2. Copy the Spreadsheet ID from the URL (the long string between `/d/` and `/edit`).
3. Share the sheet with the service account email (found in `credentials.json` as `client_email`) with Editor permissions.

### 4. Configure the Project

1. Place `credentials.json` in the root directory of the project.
2. Set the `SPREADSHEET_ID` environment variable to your Google Sheet ID (default: `1cbCBWczW85kFIHKmDGAYwdNj1WPGpkDlTt_jRB8s0zQ`).
   - For local: Create a `.env` file or export the variable: `export SPREADSHEET_ID=your_sheet_id`
   - For GitHub Actions: Set it as a repository secret named `SPREADSHEET_ID`.

### 5. For GitHub Actions (Optional)

If you want to run the scraper via GitHub Actions:

1. Go to your GitHub repository settings.
2. Navigate to "Secrets and variables" > "Actions".
3. Create the following secrets:
   - `GOOGLE_CREDENTIALS_JSON`: Paste the entire content of your `credentials.json` file.
   - `SPREADSHEET_ID`: Your Google Sheet ID (e.g., `1cbCBWczW85kFIHKmDGAYwdNj1WPGpkDlTt_jRB8s0zQ`).
4. Remove `credentials.json` from your local repository and commit the change.

## Running the Project

### Local Execution

```bash
npm start
```

This will:
- Scrape data from the configured website.
- Save data to CSV files in the root directory.
- Append data to Google Sheets (creating sheets as needed with today's date format YYYY-MM-DD).

### Manual Execution via GitHub Actions

1. Go to the "Actions" tab in your GitHub repository.
2. Select the "Manual Scrape" workflow.
3. Click "Run workflow" to execute the scraper in the cloud.

## Project Structure

- `src/index.ts`: Main entry point for full scraping.
- `src/util.ts`: Utility functions for scraping and data processing.
- `src/csv.util.ts`: Functions for CSV and Google Sheets operations.
- `src/model.ts`: TypeScript interfaces and configurations.
- `.github/workflows/scrape.yml`: GitHub Actions workflow for manual execution.

## Features

- Web scraping using Puppeteer.
- Automatic sheet creation in Google Sheets.
- Date-based sheet naming (YYYY-MM-DD).
- CSV export with UTF-8 BOM for Excel compatibility.
- Error handling and retries.

## Google Apps Script Integration

The `apps-script.gs` file contains Google Apps Script code that can be used in your Google Sheet for additional automation.

### Setup Telegram Integration

1. Create a Telegram bot:
   - Message `@BotFather` on Telegram
   - Use `/newbot` command and follow instructions
   - Save the bot token

2. Get your chat ID:
   - Message your bot
   - Visit `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
   - Find your chat ID in the response

3. In Google Apps Script:
   - Open your sheet's script editor
   - Update the configuration constants with your values
   - Deploy the script as a web app: **Publish > Deploy as web app**
   - Set "Execute the app as:" to "Me"
   - Set "Who has access to the app:" to "Anyone, even anonymous"
   - Copy the deployed URL and update `DEPLOYED_URL` in the script
   - Run `setupTelegramWebhook()` from the menu to activate the webhook
   - Save the script

4. Authorize the script to send external requests (for Telegram API)

### Apps Script Features

- **Data Filtering**: Filter data by location, price, or age
- **Telegram Notifications**: Send filtered results or daily summaries to Telegram
- **Telegram Commands**: Receive and process filter commands via Telegram bot
- **Read-Only Operations**: All operations read data without modifying the spreadsheet
- **Custom Menu**: Access read-only features from the Sheets UI

### Telegram Commands

Send commands to your bot to filter and retrieve data in real-time:

- `/filter location <location>` - Filter by location (e.g., `/filter location Sài Gòn`)
- `/filter price <operator><amount>` - Filter by price (e.g., `/filter price <500000`)
- `/filter age <min>-<max>` - Filter by age range (e.g., `/filter age 18-25`)
- `/summary` - Get daily summary
- `/help` - Show available commands

Commands are processed instantly via webhook when you send messages to the bot.

## License

This project is private and for personal use only.