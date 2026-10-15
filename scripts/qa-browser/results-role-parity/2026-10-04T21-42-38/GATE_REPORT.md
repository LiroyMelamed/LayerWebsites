# ROLE MODEL QA GATE

**Verdict:** ROLE MODEL QA FAIL

## FRONTEND DEPLOY: PASS
**build hash:** main.be78a787.js

## NAV PARITY
Admin: ["כל התיקים","תיק חדש / עדכון תיק","יומן"]
Lawyer: ["כל התיקים","תיק חדש / עדכון תיק","יומן"]
Equal: YES

## ROUTES
allowed 3/3
denied 10/10

## PA-ONLY routes
{
  "platformSettings": {
    "admin": "blocked",
    "lawyer": "blocked"
  },
  "planUsage": {
    "admin": "blocked",
    "lawyer": "blocked"
  },
  "plansPricing": {
    "admin": "blocked",
    "lawyer": "blocked"
  }
}

## SERVER-SIDE PA-ONLY API: PASS

## NETWORK
expected403: 7
unexpected403: 2
5xx: 0

## RESTORE: PASS
