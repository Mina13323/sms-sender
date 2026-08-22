# Systemic Form Assistant

An operator-assisted form automation Tampermonkey userscript for quickly processing contact lists.

## Features
- Import contacts locally from a CSV file.
- Auto-fill form fields (Name, Phone, Message) without automatic submission.
- Navigate through contacts (Next, Previous, Skip).
- Mark contacts as Done after manual submission.
- Tracks your progress locally, surviving page refreshes.
- Strict Privacy: Zero external data uploads.

## Installation

1. Install the [Tampermonkey](https://www.tampermonkey.net/) extension for your browser (Chrome, Firefox, Edge, Safari).
2. Open the extension dashboard.
3. Create a new script.
4. Copy and paste the contents of `systemic-form-assistant.user.js` into the editor.
5. Save the script (Ctrl+S or Cmd+S).

## Usage

1. Go to the target form: `https://link.systemic-digital.net/widget/form/*`
2. You will see a floating "CONTACT ASSISTANT" panel on the top right.
3. Click **IMPORT CSV** and select your contact list.
4. Use the **FILL** button (or press `F`) to populate the current contact's information into the form.
5. Review the filled data, ensure consent if required, and **MANUALLY CLICK SEND** on the website's form.
6. After a successful send, click **MARK DONE**.
7. The assistant will advance to the next contact.

## Keyboard Shortcuts
Shortcuts are disabled when typing in an input field.
- `F` - Fill current contact
- `N` - Next contact
- `P` - Previous contact
- `S` - Skip contact
- `R` - Reset position to the first contact

## CSV Format

The CSV must contain the following columns (headers are optional but recommended):
```csv
name,phone,message
John Smith,+1234567890,"Hello, please contact me."
Jane Doe,+0987654321,"I need support."
```
If only the phone number is provided:
```csv
+1234567890
+0987654321
```
The assistant will use a default name (e.g., "Test Contact") and default message.

## Privacy & Security
- **No Automatic Submission**: The script is strictly designed to aid an operator. It will **never** click the "Send" or "Submit" button automatically.
- **Local Storage Only**: Your contact list is stored within Tampermonkey's local storage (`GM_setValue`). It is never uploaded to any analytics, telemetry, or third-party service.
- **Console Logging**: PII (Personally Identifiable Information) is intentionally excluded from developer console logs.

## Project Structure
- `systemic-form-assistant.user.js`: The userscript file.
- `README.md`: Instructions and documentation.
