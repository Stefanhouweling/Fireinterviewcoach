# API Calls & Prompts Optimization Analysis

## 🔍 Overview
This document identifies optimization opportunities in API calls and AI prompts without losing functionality.

---

## 🚨 Critical Issues Found

### 1. **Question Generation Prompt - EXTREMELY LONG (600+ lines)**
**Location:** `server/index.js` lines 1177-1745

**Problems:**
- Massive prompt with heavy repetition
- Same personalization instructions repeated 10+ times
- Redundant category instructions
- Sending full resume analysis JSON multiple times
- Very high token usage per question

**Current Token Estimate:** ~3000-4000 tokens per question

**Optimization Opportunities:**
- Extract common instructions to system message
- Remove duplicate personalization rules (mentioned 8+ times)
- Simplify category-specific logic
- Only send resume summary, not full JSON
- Use shorter, more focused prompts

**Potential Savings:** 40-50% token reduction (~1500-2000 tokens per question)

---

### 2. **Answer Analysis Prompt - Redundant Instructions**
**Location:** `server/index.js` lines 1969-2037

**Problems:**
- Duplicate instructions about transcript handling
- Repeated STAR method explanation
- Long formatting instructions that could be simplified

**Optimization:**
- Move transcript handling to system message
- Simplify formatting instructions
- Remove redundant explanations

**Potential Savings:** 20-30% token reduction

---

### 3. **Resume Parsing - Sending Full Text Multiple Times**
**Location:** `server/index.js` lines 2121-2209

**Current:** Sends full resume text every time
**Issue:** If resume is 5000 chars, that's 5000 tokens every parse

**Optimization:**
- Cache parsed resume analysis
- Only re-parse if resume text changed
- Store hash of resume text to detect changes

**Potential Savings:** 90%+ reduction if cached

---

### 4. **Duplicate API Calls**

#### Frontend Issues:
1. **Areas to Work On - Double Fetch**
   - Line 4421: GET to check if data exists
   - Line 4441: POST to generate (even if data exists)
   - **Fix:** Combine into single conditional call

2. **User Profile Updates - Multiple Calls**
   - Called from multiple places with same data
   - **Fix:** Batch updates or debounce

3. **Config Fetch - Multiple Times**
   - Google Client ID fetched 3+ times on page load
   - **Fix:** Cache after first fetch

---

## 📊 Token Usage Analysis

### Current Estimated Usage Per Session (5 questions):
- Question Generation: ~15,000-20,000 tokens (5 questions × 3000-4000)
- Answer Analysis: ~7,500-10,000 tokens (5 questions × 1500-2000)
- Resume Parsing: ~5,000 tokens (if 5000 char resume)
- Followup Questions: ~500 tokens each
- Practice Insights: ~500 tokens

**Total:** ~28,000-36,000 tokens per 5-question session

### Optimized Estimated Usage:
- Question Generation: ~9,000-12,000 tokens (40% reduction)
- Answer Analysis: ~5,250-7,000 tokens (30% reduction)
- Resume Parsing: ~500 tokens (90% reduction with caching)
- Followup Questions: ~500 tokens (same)
- Practice Insights: ~500 tokens (same)

**Total:** ~15,750-20,500 tokens per 5-question session

**Savings:** ~43-45% reduction in token usage

---

## 🔧 Specific Optimization Recommendations

### 1. **Question Generation Prompt Refactoring**

**Current Structure:**
```
System: Basic role
User: 600+ lines of instructions, examples, requirements
```

**Optimized Structure:**
```
System: 
  - Role definition
  - Core requirements (10% fire, 90% general)
  - Entry-level position context
  - Personalization rules (ONCE, not repeated)
  - Category rotation logic

User:
  - Question type & difficulty
  - Selected category (if any)
  - Resume summary (not full JSON)
  - Last 3 questions asked (not 10)
  - Category hint
  - Personalization data (concise)
```

**Changes:**
- Move all repeated instructions to system message
- Reduce resume context to summary only
- Only send last 3 questions (not 10)
- Remove duplicate personalization rules
- Simplify category-specific instructions

---

### 2. **Answer Analysis Prompt Optimization**

**Current Issues:**
- Transcript handling instructions repeated 3 times
- STAR method explained in detail every time
- Long formatting template

**Optimized:**
- Move transcript handling to system message
- Reference STAR method, don't re-explain
- Simplify formatting instructions
- Use shorter template

---

### 3. **Resume Parsing Caching**

**Implementation:**
```javascript
// Add to user profile
resumeTextHash: crypto.createHash('sha256').update(resumeText).digest('hex')

// Before parsing, check:
if (profile.resumeTextHash === newHash && profile.resumeAnalysis) {
  return profile.resumeAnalysis; // Use cached
}
```

---

### 4. **API Call Consolidation**

**Areas to Work On:**
```javascript
// Current: 2 calls
const check = await fetch('/api/areas-to-work-on?sessionId=...');
if (!check.hasData) {
  await fetch('/api/areas-to-work-on', { method: 'POST', ... });
}

// Optimized: 1 call
const result = await fetch('/api/areas-to-work-on', {
  method: 'POST',
  body: JSON.stringify({ sessionId, autoGenerate: true })
});
```

---

### 5. **Frontend Caching**

**Add caching for:**
- Mapbox token (already partially cached)
- Google Client ID config
- User profile data
- Resume analysis

---

## 📋 Action Items

### High Priority (Immediate Impact):
1. ✅ Refactor question generation prompt (40% token savings)
2. ✅ Optimize answer analysis prompt (30% token savings)
3. ✅ Add resume parsing cache (90% token savings on re-parses)
4. ✅ Consolidate areas-to-work-on API calls

### Medium Priority:
5. Add frontend caching for config/user data
6. Batch user profile updates
7. Reduce conversation history sent (last 3 instead of full history)

### Low Priority (Nice to Have):
8. Add request debouncing for rapid calls
9. Implement response compression
10. Add token usage monitoring/logging

---

## 🎯 Expected Results

After optimizations:
- **Token Usage:** 43-45% reduction
- **API Response Times:** 20-30% faster (less data to process)
- **Cost Savings:** ~$0.01-0.02 per 5-question session (depending on model pricing)
- **User Experience:** Faster responses, same quality

---

## ⚠️ Important Notes

- **No functionality will be lost** - all optimizations maintain current features
- **Quality maintained** - prompts will be more focused, not less capable
- **Backward compatible** - changes are internal optimizations
- **Test thoroughly** - ensure question quality remains high after optimization

