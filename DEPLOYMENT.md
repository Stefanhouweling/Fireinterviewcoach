# Deployment Guide - Fire Interview Coach

## Backend Setup

### 1. Install Dependencies

```bash
cd server
npm install
```

### 2. Configure Environment Variables

Copy `env.example` to `.env`:

```bash
cp env.example .env
```

Edit `.env` and add your API keys:

```
OPENAI_API_KEY=sk-your-key-here
ELEVENLABS_API_KEY=your-key-here
FRONTEND_URL=https://yourdomain.com
PORT=3001
```

### 3. Start Backend Server

```bash
npm start
```

The server will run on `http://localhost:3001`

## Frontend Configuration

### Update Backend URL

In `index.html`, find this line (around line 1193):

```javascript
const BACKEND_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:3001'  // Local development
  : 'https://your-backend-url.com';  // Production - UPDATE THIS!
```

Replace `'https://your-backend-url.com'` with your actual backend URL.

## Deployment Options

### Option 1: Render.com (Recommended)

#### Backend:
1. Create new Web Service
2. Connect your GitHub repo
3. Set build command: `cd server && npm install`
4. Set start command: `cd server && npm start`
5. Add environment variables in Render dashboard:
   - `OPENAI_API_KEY`
   - `ELEVENLABS_API_KEY`
   - `FRONTEND_URL` (your frontend URL)
   - `PORT` (Render will set this automatically)

#### Frontend:
1. Create new Static Site
2. Connect your GitHub repo
3. Set publish directory: `.` (root)
4. Update `BACKEND_URL` in `index.html` to your backend URL

### Option 2: Vercel

#### Backend:
1. Create `vercel.json` in `server/`:
```json
{
  "version": 2,
  "builds": [
    {
      "src": "index.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "index.js"
    }
  ]
}
```

2. Deploy: `vercel --cwd server`

#### Frontend:
1. Deploy static files to Vercel
2. Update `BACKEND_URL` in `index.html`

### Option 3: Railway

1. Create new project
2. Connect GitHub repo
3. Set root directory to `server/`
4. Add environment variables
5. Deploy

## Testing

1. Start backend: `cd server && npm start`
2. Open frontend in browser
3. Check browser console for API calls
4. Test all features:
   - Question generation
   - Follow-up questions
   - Answer analysis
   - Resume parsing
   - Text-to-speech

## Security Notes

- ✅ API keys are now server-side only
- ✅ Frontend never sees API keys
- ✅ CORS is configured for your frontend domain
- ✅ Environment variables are not committed to git

## Troubleshooting

### Backend not connecting:
- Check `BACKEND_URL` in `index.html`
- Verify CORS settings in `server/index.js`
- Check browser console for errors

### API errors:
- Verify API keys in `.env`
- Check server logs
- Ensure backend is running

### CORS errors:
- Update `FRONTEND_URL` in `.env`
- Check CORS configuration in `server/index.js`
