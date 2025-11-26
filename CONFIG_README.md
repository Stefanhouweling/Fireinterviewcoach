# Configuration File Guide

## Easy Text Updates with `config.js`

The `config.js` file allows you to easily update all text throughout the Fire Interview Coach application without editing the main HTML file.

## How to Use

1. **Open `config.js`** in any text editor
2. **Edit the values** you want to change
3. **Save the file** - changes will appear immediately when you refresh the page

## What You Can Change

### App Information
- `appName`: The name of your application
- `copyrightYear`: Copyright year (e.g., "2024", "2025")
- `companyName`: Your company name

### Button Text
All button labels are in the `buttons` object:
- `nextQuestion`: Text for "Next Question" button
- `answerQuestion`: Text for "Answer Question" button
- `finishAnswering`: Text for "Finish Answering Question" button
- And more...

### Footer Text
- `footer.copyright`: Copyright text (use `{year}` and `{company}` as placeholders)
- `footer.termsLink`: Terms of Service link text
- `footer.privacyLink`: Privacy Policy link text
- `footer.disclaimer`: Disclaimer text (use `{appName}` as placeholder)

### Status Messages
- `status.micIdle`: Text shown when microphone is idle
- `status.analyzing`: Text shown during analysis
- And more...

## Examples

### Change Copyright Year
```javascript
copyrightYear: "2025",  // Change from "2024" to "2025"
```

### Change Button Text
```javascript
buttons: {
  nextQuestion: "🎯 Get Next Question",  // Customize button text
  answerQuestion: "🎙️ Start Recording",
  // ...
}
```

### Change Footer Disclaimer
```javascript
footer: {
  disclaimer: "{appName} is a practice tool only and does not guarantee job offers or employment."
}
```

## Notes

- Placeholders like `{year}`, `{company}`, and `{appName}` are automatically replaced
- Emojis are supported in all text fields
- Changes take effect immediately after saving and refreshing the page
- No coding knowledge required - just edit the text values!

