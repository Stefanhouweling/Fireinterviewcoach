# Deployment Checklist - Fire Interview Coach

## ✅ Pre-Deployment Checklist

- [x] Backend code created (`server/index.js`)
- [x] Frontend updated to use backend
- [x] Environment variable template created (`server/env.example`)
- [x] `.gitignore` configured (`.env` not committed)
- [x] `render.yaml` created for easy Render deployment

## 🚀 Step 1: Deploy Backend to Render.com

### 1.1 Create Backend Service
1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repository
4. Select the repository: `Fireinterviewcoach`

### 1.2 Configure Backend Service
- **Name**: `fire-interview-coach-api` (or your preferred name)
- **Root Directory**: `server`
- **Environment**: `Node`
- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Plan**: Free (or paid if you need more resources)

### 1.3 Add Environment Variables
Click **"Environment"** tab and add:

| Key | Value | Notes |
|-----|-------|-------|
| `OPENAI_API_KEY` | `sk-...` | Your OpenAI API key |
| `ELEVENLABS_API_KEY` | `...` | Your ElevenLabs API key |
| `FRONTEND_URL` | `https://your-frontend-url.onrender.com` | Set this AFTER deploying frontend |
| `NODE_ENV` | `production` | Optional but recommended |
| `PORT` | (auto-set) | Render sets this automatically |

### 1.4 Deploy
- Click **"Create Web Service"**
- Wait for deployment (2-5 minutes)
- Copy your backend URL (e.g., `https://fire-interview-coach-api.onrender.com`)

## 🌐 Step 2: Deploy Frontend to Render.com

### 2.1 Create Static Site
1. In Render Dashboard, click **"New +"** → **"Static Site"**
2. Connect your GitHub repository
3. Select the repository: `Fireinterviewcoach`

### 2.2 Configure Frontend
- **Name**: `fire-interview-coach` (or your preferred name)
- **Root Directory**: `.` (root)
- **Build Command**: (leave empty or `echo "No build needed"`)
- **Publish Directory**: `.` (root)

### 2.3 Update Backend URL
1. **Before deploying**, update `index.html`:
   - Find line ~1193: `const BACKEND_URL = ...`
   - Replace `'https://YOUR-BACKEND-URL.onrender.com'` with your actual backend URL from Step 1.4
   - Commit and push this change

2. **OR** update after deployment:
   - Deploy frontend first
   - Then update `index.html` with backend URL
   - Push the change (Render will auto-redeploy)

### 2.4 Deploy
- Click **"Create Static Site"**
- Wait for deployment (1-2 minutes)
- Copy your frontend URL (e.g., `https://fire-interview-coach.onrender.com`)

### 2.5 Update Backend CORS
1. Go back to your backend service in Render
2. Update `FRONTEND_URL` environment variable:
   - Set it to your frontend URL from Step 2.4
3. Render will automatically restart the backend

## 🧪 Step 3: Testing

### 3.1 Test Backend
1. Visit: `https://your-backend-url.onrender.com/health`
2. Should see: `{"status":"ok","message":"Fire Interview Coach API is running"}`

### 3.2 Test Frontend
1. Visit your frontend URL
2. Open browser console (F12)
3. Check for any CORS or API errors
4. Test features:
   - [ ] Upload resume
   - [ ] Generate question
   - [ ] Answer question
   - [ ] Analyze answer
   - [ ] Text-to-speech

### 3.3 Troubleshooting

**Backend not connecting:**
- Check `BACKEND_URL` in `index.html` matches your backend URL
- Check browser console for errors
- Verify backend is running (check `/health` endpoint)

**CORS errors:**
- Verify `FRONTEND_URL` in backend environment variables
- Check it matches your frontend URL exactly (including `https://`)

**API errors:**
- Check backend logs in Render dashboard
- Verify API keys are set correctly
- Check backend service is running

## 📝 Quick Reference

### Backend URL Format
```
https://fire-interview-coach-api.onrender.com
```

### Frontend URL Format
```
https://fire-interview-coach.onrender.com
```

### Update Backend URL in Frontend
File: `index.html` (line ~1193)
```javascript
return 'https://YOUR-ACTUAL-BACKEND-URL.onrender.com';
```

## 🔒 Security Notes

✅ API keys are now server-side only
✅ Frontend never sees API keys
✅ CORS configured for your domain
✅ Environment variables secure in Render

## 📞 Need Help?

- Check Render logs in dashboard
- Check browser console for errors
- Verify all environment variables are set
- Ensure backend URL is correct in frontend
