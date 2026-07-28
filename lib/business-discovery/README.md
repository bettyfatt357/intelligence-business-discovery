# Business Discovery Domain Layer

## Overview

The Business Discovery domain layer is a **storage-agnostic, infrastructure-independent** domain model that defines the complete business discovery system.

All other components (search service, queue, worker, extraction engine, dashboard) depend on this domain and should be implemented to work with these types and interfaces.

## Architecture Principles

### 1. **Storage Agnostic**
- No Redis, Supabase, database, or filesystem operations
- No HTTP requests or API calls
- No UI or presentation logic
- Pure domain logic and type definitions

### 2. **Infrastructure Independent**
- No external framework dependencies
- No environment configuration
- Works with any storage backend or UI
- Portable to different runtime environments

### 3. **Plugin Architecture**
- Deobfuscation, company detection, and pattern matching are plugins
- New extraction methods can be added without modifying core domain
- Registries allow runtime plugin composition
- Fully extensible system

### 4. **Immutable Records**
- Discovery records are captured at search time and never modified
- Provides complete audit trail
- Enables reproducibility and forensics

### 5. **Evidence-Based**
- All findings backed by evidence
- Evidence tracks WHERE and HOW findings were discovered
- Enables verification and quality assessment

## Directory Structure

```
lib/business-discovery/
├── index.ts                    # Main exports
├── README.md                   # This file
│
├── types/                      # Domain model types
│   ├── discovery-record.ts     # Google search result with context
│   ├── intelligence-record.ts  # Complete final result
│   ├── company.ts              # Detected company info
│   ├── email-intelligence.ts   # Extracted email data
│   ├── page-content.ts         # Extracted page metadata
│   ├── evidence.ts             # Evidence collection
│   ├── quality-metrics.ts      # Quality scoring
│   └── errors.ts               # Domain-specific errors
│
├── plugins/                    # Plugin interfaces
│   ├── deobfuscation-plugin.ts      # Email extraction methods
│   ├── company-detection-plugin.ts  # Company detection sources
│   └── pattern-matching-plugin.ts   # Pattern matching rules
│
└── builders/                   # Orchestration and scoring
    ├── intelligence-builder.ts # Main orchestrator
    └── quality-scorer.ts       # Quality metrics calculation
```

## Core Types

### DiscoveryRecord
Immutable capture of a Google search result with search context.

```typescript
{
  searchContext: { keyword, pattern, location, searchDepth, searchedAt }
  googleResult: { rank, query, url, title, snippet }
  status: 'pending' | 'processing' | 'completed' | 'failed'
}
```

### IntelligenceRecord
Complete business intelligence result combining all discovery and analysis.

```typescript
{
  discovery: DiscoveryRecord
  pageContent: PageContent
  company: Company
  emails: EmailIntelligence[]
  patternMatches: PatternMatch[]
  evidence: EvidenceCollection
  quality: QualityMetrics
  processing: { status, durationMs, errors }
}
```

### Company
Detected company with confidence and source information.

```typescript
{
  name: string
  confidence: number (0-1)
  detectionSource: CompanyDetectionSource
  secondarySources: CompanyDetectionSource[]
  metadata: { rawValue, detectedAt, extractionMethod }
}
```

### EmailIntelligence
Email extracted with method and confidence.

```typescript
{
  email: string
  extractionMethod: EmailExtractionMethod (18 methods)
  confidence: number (0-1)
  htmlLocation: { tag, attribute, cssSelector }
  metadata: { extractedAt, dataType, obfuscationLevel }
}
```

## Plugin System

### Deobfuscation Methods (18 total)

```
- plaintext
- mailto
- html-entity
- unicode
- hex
- decimal
- base64
- rot13
- css-hidden
- javascript-variable
- react-props
- vue-data
- angular-template
- next-hydration
- shadow-dom
- json-ld
- data-attribute
- onclick-handler
```

Each method implements `DeobfuscationPlugin`:
```typescript
interface DeobfuscationPlugin {
  id: EmailExtractionMethod
  name: string
  description: string
  requiresJSRendering: boolean
  canDetect(html: string): boolean
  extract(html: string): Promise<string[]>
  extractWithContext(html: string): Promise<Array<{email, evidence, confidence}>>
}
```

### Company Detection Sources (6 total)

```
- schema-org       (schema.org Organization markup)
- json-ld          (JSON-LD structured data)
- opengraph        (og:site_name)
- page-title       (Page title extraction)
- heading          (H1 tag parsing)
- domain           (Domain fallback)
```

Each source implements `CompanyDetectionPlugin`:
```typescript
interface CompanyDetectionPlugin {
  id: CompanyDetectionSource
  name: string
  priority: number
  isAvailable(pageContent, html): boolean
  detect(pageContent, html): Promise<Company | null>
  getConfidenceWeight(): number
}
```

### Pattern Matching Stages

**Stage 1: Query Generation**
- Patterns used to generate Google PSE queries
- Example: "contact team leadership" patterns

**Stage 2: URL Validation**
- Patterns checked against discovered URLs
- Example: /contact, /team, /careers

**Stage 3: HTML Matching**
- Patterns searched within page content
- Example: "Contact", "Support", "Investor Relations"

Each pattern implements `PatternMatchingPlugin`:
```typescript
interface PatternMatchingPlugin {
  pattern: PatternDefinition
  matchesUrl(url): boolean
  matchesMetadata(pageContent): boolean
  matchesHtml(html): Array<{location, context, confidence}>
  calculateConfidence(urlMatch, metadataMatch, htmlMatches): number
}
```

## Quality Metrics

Comprehensive scoring determines reliability:

```typescript
QualityMetrics {
  confidence: number (0-1)
  scores: {
    companyConfidence
    emailCompleteness
    emailAccuracy
    patternConfidence
    overallQuality
  }
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
  factors: { hasCompanyName, hasVerifiedEmails, hasStructuredMarkup, ... }
  warnings: string[]
  actionability: { isActionable, suggestedActions, needsVerification }
}
```

## Usage in Other Components

### Search Service
```typescript
// Creates DiscoveryRecord for each Google result
import { DiscoveryRecord } from '@/lib/business-discovery'

// After Google PSE returns results:
const discoveries: DiscoveryRecord[] = results.map(result => ({
  searchContext: { keyword, pattern, location, searchDepth },
  googleResult: { rank, query, url, title, snippet },
  status: 'pending',
  createdAt: new Date()
}))
```

### Queue System
```typescript
// Stores DiscoveryRecord with job metadata
import { DiscoveryRecord } from '@/lib/business-discovery'

const job = {
  id: uuid(),
  url: discovery.googleResult.url,
  discoveryRecord: discovery,  // Keep full context
  createdAt: new Date()
}
```

### Worker
```typescript
// Processes discovery to build IntelligenceRecord
import { IntelligenceBuilder, IntelligenceRecord } from '@/lib/business-discovery'

const intelligence: IntelligenceRecord = await builder.build(
  job.discoveryRecord,
  pageContent,
  html
)
```

### Dashboard
```typescript
// Displays IntelligenceRecord
import { IntelligenceRecord } from '@/lib/business-discovery'

function DiscoveryResult({ intelligence }: { intelligence: IntelligenceRecord }) {
  return (
    <div>
      <h2>{intelligence.company.name}</h2>
      <p>Confidence: {intelligence.quality.confidence}</p>
      {intelligence.emails.map(email => (
        <span key={email.email}>{email.email} ({email.extractionMethod})</span>
      ))}
    </div>
  )
}
```

## Dependency Graph

```
index.ts (exports all)
  ↓
types/ (core domain model)
  ├── discovery-record.ts
  ├── intelligence-record.ts
  ├── company.ts
  ├── email-intelligence.ts
  ├── page-content.ts
  ├── evidence.ts
  ├── quality-metrics.ts
  └── errors.ts
  ↓
plugins/ (plugin interfaces)
  ├── deobfuscation-plugin.ts
  ├── company-detection-plugin.ts
  └── pattern-matching-plugin.ts
  ↓
builders/ (orchestration)
  ├── intelligence-builder.ts
  └── quality-scorer.ts

Search Service → creates DiscoveryRecords
Queue → stores DiscoveryRecords + jobs
Worker → reads DiscoveryRecords, builds IntelligenceRecords
Dashboard → displays IntelligenceRecords
```

## No Breaking Changes

The domain layer is purely additive:
- Existing queue continues to work
- Existing jobs process normally
- New searches create DiscoveryRecords
- Gradual migration to new system

## File Sizes

All files kept under 300 lines:
- Type files: 50-100 lines each
- Plugin interfaces: 90-120 lines each
- Builder interfaces: 110-120 lines each
- Total domain layer: ~1200 lines across 13 files

## Next Phase

Once domain layer is approved, implementation phases use this as foundation:
1. Phase 1: ✅ Domain layer (THIS)
2. Phase 2: Search service creates DiscoveryRecords
3. Phase 3: Queue handles DiscoveryRecords
4. Phase 4-11: Implementation using domain types
