# Dark Web Crawler

A Node.js/TypeScript project to scrape escort data from websites and save to CSV and Google Sheets using Playwright.

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
npx playwright install chromium
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

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Set environment variables in `.env`:
   - `SPREADSHEET_ID`: Your Google Sheet ID.
   - `BASE_URL`: The starting URL to crawl.
   - `UPLOAD_TO_SHEETS`: Set to `true` (default) to upload to Google Sheets, or `false` to skip uploading during debug/tests.
3. Place `credentials.json` in the root directory of the project.

### 5. For GitHub Actions (Optional)

If you want to run the scraper via GitHub Actions:

1. Go to your GitHub repository settings.
2. Navigate to "Secrets and variables" > "Actions".
3. Create the following secrets:
   - `GOOGLE_CREDENTIALS_JSON`: Paste the entire content of your `credentials.json` file.
   - `SPREADSHEET_ID`: Your Google Sheet ID.
   - `BASE_URL`: Your target URL.

## Running the Project

### Local Execution (Full Execution with Google Sheets Upload)

```bash
npm start
# Or specify a custom URL:
npm start "https://example.com/gai-goi/sai-gon"
```

### Local Execution (Test Mode - CSV Only, Skip Upload)

```bash
npm test
# Or specify a custom URL:
npm test "https://example.com/gai-goi/sai-gon"
```

This will:
- Scrape data from the specified website.
- Save data to CSV files in the root directory.
- Append data to Google Sheets (if `UPLOAD_TO_SHEETS` is `true` and credentials exist).

### Manual Execution via GitHub Actions

1. Go to the "Actions" tab in your GitHub repository.
2. Select the "Manual Scrape" workflow.
3. Click "Run workflow" to execute the scraper in the cloud.

## Project Structure

- `src/index.ts`: Main entry point for full scraping.
- `src/util.ts`: Utility functions for scraping and data processing using Playwright.
- `src/csv.util.ts`: Functions for CSV and Google Sheets operations.
- `src/model.ts`: TypeScript interfaces and configurations.
- `src/app-script/`: Google Apps Script source files for Google Sheets integration.
- `.github/workflows/scrape.yml`: GitHub Actions workflow for manual execution.

## Features

- Web scraping using **Playwright**.
- Automatic sheet creation in Google Sheets.
- Option to disable Google Sheets upload during debug (`UPLOAD_TO_SHEETS=false`).
- Date-based sheet naming (YYYY-MM-DD).
- CSV export with UTF-8 BOM for Excel compatibility.
- Error handling and retries.

## Google Apps Script Integration

The `src/app-script/` directory contains Google Apps Script code that can be deployed to your Google Sheet for additional automation.

### Setup Telegram Integration via Script Properties

1. Create a Telegram bot via `@BotFather`.
2. In Google Apps Script Editor (**Extensions > Apps Script**):
   - Go to **Project Settings** > **Script Properties**.
   - Add the following properties:
     - `TELEGRAM_BOT_TOKEN`: Your Telegram Bot token.
     - `TELEGRAM_CHAT_ID`: Your Telegram Chat ID.
     - `GEMINI_API_KEY`: Your Gemini API key.
     - `SPREADSHEET_ID`: Your Google Sheet ID.
     - `DEPLOYED_URL`: Deployed Web App URL.
3. Deploy as Web App with access set to "Anyone".

## License

This project is private and for personal use only.