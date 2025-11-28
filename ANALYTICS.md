# Analytics Dashboard Guide

## Overview
The analytics system tracks visitor information in a privacy-compliant way:
- **IP addresses are hashed** (SHA-256) - cannot be reversed to identify individuals
- **Only location data** (city, state/province, country) - no full addresses
- **Session IDs are partially masked** in the dashboard
- **No personally identifiable information** (PII) is stored

## What is Tracked
- **Visits**: When users complete onboarding
- **Location**: City, state/province, country (from onboarding)
- **Department**: Department name selected during onboarding
- **Job Type**: Position type (Fire, Police, etc.)
- **Questions Answered**: Number of questions each session answers
- **User ID**: Only if user is logged in (links anonymous sessions to accounts)

## Accessing the Analytics Dashboard

### 1. Set up the Analytics Secret
In your Render backend environment variables, add:
```
ANALYTICS_SECRET=your-strong-random-secret-key-here
```

### 2. Access the Dashboard
Visit:
```
https://your-backend-url.onrender.com/api/analytics/dashboard?secret=YOUR_SECRET
```

Replace:
- `your-backend-url.onrender.com` with your actual backend URL
- `YOUR_SECRET` with the value you set in `ANALYTICS_SECRET`

### 3. Dashboard Response
The dashboard returns JSON with:
- **stats**: Overall statistics (total visits, unique sessions, registered users, total questions, countries, departments)
- **visits**: List of all visits (last 1000) with:
  - Partial session ID (first 8 chars only)
  - User ID (if logged in)
  - Location (city, state/province, country)
  - Department name
  - Job type
  - Questions answered
  - First visit and last visit timestamps
- **breakdown**:
  - **by_department**: Count of visits per department
  - **by_country**: Count of visits per country
  - **by_date**: Daily visit counts (last 30 days)

## Privacy Compliance
- ✅ IP addresses are hashed (SHA-256 with secret salt)
- ✅ Only city/state/country stored (not full addresses)
- ✅ Session IDs partially masked in dashboard
- ✅ No email addresses or names stored in analytics
- ✅ User IDs only linked if user is logged in
- ✅ Complies with GDPR/privacy regulations

## Example Dashboard Response
```json
{
  "stats": {
    "total_visits": 150,
    "unique_sessions": 120,
    "registered_users": 45,
    "total_questions": 320,
    "countries": 12,
    "departments": 25
  },
  "visits": [
    {
      "id": 1,
      "session_id": "session_1...",
      "user_id": null,
      "city": "Vancouver",
      "state_province": "British Columbia",
      "country": "Canada",
      "department_name": "Vancouver Fire Department",
      "job_type": "Fire",
      "questions_answered": 5,
      "first_visit_at": "2024-01-15 10:30:00",
      "last_visit_at": "2024-01-15 11:45:00"
    }
  ],
  "breakdown": {
    "by_department": [
      { "department_name": "Vancouver Fire Department", "count": 15 },
      { "department_name": "Toronto Fire Services", "count": 12 }
    ],
    "by_country": [
      { "country": "United States", "count": 80 },
      { "country": "Canada", "count": 45 }
    ],
    "by_date": [
      { "date": "2024-01-15", "count": 25 },
      { "date": "2024-01-14", "count": 18 }
    ]
  }
}
```

## Notes
- Analytics are automatically logged when users complete onboarding
- Question usage is automatically tracked when questions are generated
- The dashboard requires the secret key for security
- All data is stored in the `analytics_visits` table in SQLite
