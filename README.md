# Klaviyo Campaigns Connector for Looker Studio



## Overview
This is a community connector for Google Looker Studio that allows you to import and visualize data from your Klaviyo email campaigns. The connector fetches campaign details such as ID, name, status, creation date, update date, send time, subject line, and preview text, making it easy to analyze your email marketing performance within Looker Studio.

## Features

- Retrieve basic campaign details (ID, name, status, created_at, updated_at, send_time).
- Include campaign message details (subject line and preview text) using the Klaviyo API.
- Simple authentication with API Key.
- Compatible with Looker Studio's data visualization tools.

## Prerequisites

- A Klaviyo account with an active API Key (Private API Key starting with `pk_`).
- Google Looker Studio account.
- Basic knowledge of Google Apps Script (for deployment).

## Installation

1. **Clone the Repository:**
   ```bash
   git clone https://github.com/rcorzogutierrez/klaviyo-connector-LookerStudio.git
   cd klaviyo-connector-LookerStudio
   
2. **Open in Google Apps Script:**  
   - Go to script.google.com and create a new project.
   - Replace the default Code.gs with the contents of Code.gs from this repository.
   - Create a new file named appsscript.json and paste the contents of appsscript.json from this repository.
    
3. **Deploy as a Connector:**
   - In the Apps Script editor, click Deploy > New Deployment.
   - Select Type > Add-on and choose Looker Studio as the add-on type.
   - Set the access to Anyone and deploy the project.
   - Copy the Deployment ID provided after deployment.

4. **Add to Looker Studio:**
   - Open Looker Studio and create a new data source.
   - Select Community & Partner Connectors and search for your connector using the Deployment ID.
   - Authenticate with your Klaviyo API Key when prompted.
  
  ## Configuration
  - **Authentication:** Enter your Klaviyo Private API Key (starting with pk_) when prompted by Looker Studio.
