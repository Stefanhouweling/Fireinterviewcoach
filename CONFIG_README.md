# 📝 Configuration File Guide

## 🎯 One File to Rule Them All!

**`app-config.js`** is your **single, master configuration file** for updating ALL text throughout the Fire Interview Coach application.

No need to edit HTML files - just edit this one file!

---

## 🚀 Quick Start

1. **Open `app-config.js`** in any text editor
2. **Find the section** you want to edit (use Ctrl+F / Cmd+F to search)
3. **Change the text** between the quotes
4. **Save the file**
5. **Refresh your browser** - changes appear immediately!

---

## 📋 What You Can Change

The config file is organized into clear sections with emoji labels:

### 🏢 Basic App Information
- App name, tagline, copyright year, company name

### 🔘 Buttons
- All button text (Next Question, Answer Question, etc.)

### 📊 Status Messages
- Loading states, analysis messages, etc.

### 📖 Instructions & Help Text
- Welcome messages, instructions, help text

### 🔔 Modals
- Terms modal, feedback modal titles

### ❌ Error Messages
- All error messages users might see

### 🎯 Onboarding
- All text for the onboarding form:
  - Resume upload section
  - Location search section
  - Job type selection
  - Department name
  - Name field
  - Voice preference
  - Error messages

### 📄 Footer
- Copyright, terms links, disclaimer

---

## 💡 Using Placeholders

You can use these placeholders that get automatically replaced:

- `{appName}` → Replaced with your app name
- `{year}` → Replaced with copyright year
- `{company}` → Replaced with company name

**Example:**
```javascript
footer: {
  copyright: "© {year} {company}. All rights reserved.",
  disclaimer: "{appName} is a practice tool only..."
}
```

---

## 📝 Examples

### Change App Name
```javascript
appName: "My Custom Interview Coach",
```

### Change Button Text
```javascript
buttons: {
  nextQuestion: "🎯 Get Next Question",
  answerQuestion: "🎙️ Start Recording",
}
```

### Change Onboarding Title
```javascript
onboarding: {
  title: "🎯 Welcome! Let's Begin",
  subtitle: "Tell us about yourself..."
}
```

### Change Footer Copyright
```javascript
footer: {
  copyright: "© {year} {company}. All rights reserved.",
}
```

---

## 🎨 Tips

- ✅ **Emojis are supported** - Feel free to use them!
- ✅ **HTML is supported** - Use `<strong>`, `<br>`, etc. in text fields
- ✅ **No coding required** - Just edit the text values
- ✅ **Changes are instant** - Refresh browser to see updates
- ✅ **Use Ctrl+F / Cmd+F** - Search for any text quickly

---

## 📍 File Structure

The config file is organized with clear section headers:

```javascript
// ============================================
// 🏢 BASIC APP INFORMATION
// ============================================
appName: "Fire Interview Coach",
...

// ============================================
// 🔘 BUTTONS - All Button Text
// ============================================
buttons: {
  nextQuestion: "🎤 Next Question",
  ...
}
```

Each section is clearly labeled so you can find what you need quickly!

---

## ❓ Need Help?

- **Can't find a text?** Use Ctrl+F / Cmd+F to search the config file
- **Want to add new text?** Add it to the appropriate section
- **Placeholders not working?** Make sure you use `{placeholderName}` format
- **Changes not showing?** Make sure you saved the file and refreshed the browser

---

**That's it!** One file, easy to edit, all your text in one place! 🎉

