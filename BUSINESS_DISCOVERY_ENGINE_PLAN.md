# Business Discovery Engine - Implementation Plan

**Status**: PLANNING PHASE  
**Objective**: Transform search platform into enterprise Business Discovery Engine (SerpDigger-like)  
**Constraints**: Do NOT rewrite, preserve existing architecture, max 300-350 lines per file  

---

## CURRENT ARCHITECTURE ANALYSIS

### What Exists (Approved & Working)
- Google PSE search integration
- Query enhancement and URL filtering
- Redis queue for job management
- Email extraction engine with deobfuscation
- Worker processing with rate limiting
- Dashboard search page with advanced discovery

### Current Search Workflow
```
1. Dashboard → Google PSE search
2. Extract URLs from results
3. Add URLs to Redis queue
4. Worker processes each URL
5. Extract emails from pages
6. Return results
```

### Gap vs. Required Business Discovery Engine
Currently missing:
- DiscoveryRecord creation for every Google result
- Search context (keyword, pattern, location) in queue
- Company detection and confidence scoring
- Comprehensive Intelligence Record
- Pattern matching in 3 stages
- Modular deobfuscation engine
- Enhanced dashboard results display

---

## IMPLEMENTATION PHASES

### Phase 1: Core Data Models
Create new types and interfaces without modifying existing code.

**New File**: `lib/types/business-discovery.ts`
- DiscoveryRecord (Google result + metadata)
- IntelligenceRecord (final result with extracted data)
- DeobfuscationMethod (enum for plugin system)
- CompanyConfidenceSource (schema.org, JSON-LD, etc.)

### Phase 2: DiscoveryRecord Integration
Pass Google search metadata through the queue instead of just URLs.

**Modify**: `lib/search/search-service.ts`
- After Google PSE returns results, create DiscoveryRecord for each
- Include: keyword, pattern, location, googleQuery, googleRank, title, snippet, url
- Pass complete DiscoveryRecord to queue

**Modify**: `lib/queue/types.ts`
- Extend Job interface to include discoveryRecord property
- Keep existing properties for backward compatibility

**Modify**: `lib/queue/queue.ts`
- Update addJob() to accept DiscoveryRecord
- Store discoveryRecord metadata in Redis alongside job

### Phase 3: Modular Deobfuscation Engine
Create plugin-based email extraction system.

**New File**: `lib/extraction/deobfuscation-methods.ts`
- PlainTextMethod
- MailtoMethod
- HtmlEntityMethod
- UnicodeMethod
- HexMethod
- DecimalMethod
- Base64Method
- ROT13Method
- CSSHiddenMethod
- JavaScriptVarMethod
- ReactPropsMethod
- VueDataMethod
- AngularTemplateMethod
- NextHydrationMethod
- ShadowDOMMethod
- JSONLDMethod
- DataAttributeMethod
- OnClickHandlerMethod

Each method: `{ name, detect(), extract() }`

**Modify**: `lib/extraction/deobfuscate.ts`
- Use modular methods instead of hardcoded logic
- Iterate through methods, collecting results
- Track which method found each email

### Phase 4: Company Detection Engine
Confidence-based company identification.

**New File**: `lib/extraction/company-detector.ts`
- detectCompany(html, metadata) → {name, confidence, source}
- Check in order:
  1. schema.org Organization markup
  2. JSON-LD structured data
  3. OpenGraph og:site_name
  4. Page title extraction
  5. H1 tag parsing
  6. Domain fallback

### Phase 5: Pattern Matching (3 Stages)
Pattern application at different workflow stages.

**Modify**: `lib/search/query-generator.ts` (Stage 1)
- Patterns used in Google query generation
- Example: "contact team leadership" patterns

**New File**: `lib/extraction/url-pattern-matcher.ts` (Stage 2)
- Check URL against patterns: /contact, /team, /leadership, /careers, /about
- Used during queue processing

**New File**: `lib/extraction/html-pattern-matcher.ts` (Stage 3)
- Check page content for pattern keywords
- Example: "Contact", "Support", "Investor Relations"
- Track matched patterns for Intelligence Record

### Phase 6: Intelligence Record Builder
Construct comprehensive result records.

**New File**: `lib/extraction/intelligence-builder.ts`
- buildIntelligence(extraction, discovery, patterns) → IntelligenceRecord
- Combines:
  - Company detection results
  - Pattern matching results
  - Email extraction results
  - Discovery metadata
  - Confidence scoring

### Phase 7: Worker Enhancement
Update worker to process in stages and build Intelligence Records.

**Modify**: `lib/worker/worker.ts`
- Stage 1: Download page
- Stage 2: Extract metadata (title, description)
- Stage 3: Detect company
- Stage 4: Extract HTML (handle Shadow DOM, JS rendering)
- Stage 5: Run deobfuscation engine
- Stage 6: Match patterns in HTML
- Stage 7: Build Intelligence Record
- Return complete IntelligenceRecord instead of just emails

**Modify**: `lib/extraction/engine.ts`
- Return extraction context (method used, confidence)
- Track extraction metadata for Intelligence Record

### Phase 8: Dashboard Results Display
Show comprehensive discovery intelligence.

**New File**: `components/DiscoveryResults.tsx`
- Display for each result:
  - Company name + confidence
  - URL + Google rank
  - Page title + matched keyword
  - Matched pattern + HTML location
  - Extracted emails + extraction method
  - Evidence snippet showing context
  - Overall confidence score
  - Extraction status

**Modify**: `/app/dashboard/search/page.tsx`
- After search completes, fetch/display Intelligence Records
- Show comprehensive result set instead of just emails
- Group by company
- Filter/sort options

---

## NEW FILE STRUCTURE

```
lib/
├── types/
│   └── business-discovery.ts       (NEW)
├── extraction/
│   ├── deobfuscation-methods.ts    (NEW - methods)
│   ├── company-detector.ts         (NEW)
│   ├── url-pattern-matcher.ts      (NEW)
│   ├── html-pattern-matcher.ts     (NEW)
│   ├── intelligence-builder.ts     (NEW)
│   ├── deobfuscate.ts              (MODIFY - use methods)
│   └── engine.ts                   (MODIFY - return context)
├── search/
│   └── search-service.ts           (MODIFY - create Discovery Records)
└── queue/
    ├── types.ts                    (MODIFY - add discoveryRecord)
    └── queue.ts                    (MODIFY - handle Discovery Records)

components/
└── DiscoveryResults.tsx            (NEW)

app/dashboard/
└── search/page.tsx                 (MODIFY - display results)
```

---

## KEY DESIGN DECISIONS

### 1. Discovery Record Immutability
- Google result metadata captured at search time
- Never changes during processing
- Provides complete audit trail

### 2. Modular Deobfuscation
- Plugin architecture for extensibility
- Each method independent
- Can add new methods without modifying existing code
- Track which method found each email

### 3. Company Detection Confidence
- Hierarchical approach (schema.org > JSON-LD > OpenGraph > etc.)
- Confidence score reflects detection method
- Falls back to domain if nothing better

### 4. Pattern Matching Integration
- Stage 1: Query generation (what to search for)
- Stage 2: URL validation (which URLs to crawl)
- Stage 3: HTML matching (where patterns appear)
- All stages contribute to final Intelligence Record

### 5. Intelligence Record Completeness
- Contains all information about discovery
- Can be stored for auditing
- Supports all dashboard display needs
- Enables future analytics/reporting

---

## IMPLEMENTATION ORDER

1. **Phase 1**: Create business-discovery.ts types (1 file, isolated)
2. **Phase 2**: Modify search-service.ts to create Discovery Records (creates records, no breaking changes)
3. **Phase 3**: Modify queue to handle Discovery Records (backward compatible)
4. **Phase 4**: Create deobfuscation methods (new, doesn't change existing logic)
5. **Phase 5**: Create company detector (new, independent)
6. **Phase 6**: Create pattern matchers (new, independent)
7. **Phase 7**: Create intelligence builder (new, combines all)
8. **Phase 8**: Modify worker to use new systems (orchestrates new files)
9. **Phase 9**: Modify extraction engine to return context (new data returned)
10. **Phase 10**: Create dashboard results component (new UI)
11. **Phase 11**: Modify dashboard search page (uses new component)

---

## BACKWARD COMPATIBILITY

### What's Preserved
- All existing queue operations work unchanged
- Existing jobs continue processing
- Current dashboard search functionality
- External API authentication
- Authentication system

### What's Extended
- Job objects gain optional discoveryRecord property
- Search service creates additional records
- Worker has new processing stages
- Extraction returns additional metadata
- Dashboard displays enhanced results

### Migration Path
- Existing queue jobs continue working (discoveryRecord is optional)
- New searches use Discovery Records
- Gradual transition: old jobs finish as before, new jobs use new system

---

## FILE SIZE TARGETS

Each file kept under 350 lines:
- deobfuscation-methods.ts: ~250 lines (18 methods)
- company-detector.ts: ~150 lines (6 detection sources)
- pattern-matchers.ts: ~100 lines each (Stage 2 & 3)
- intelligence-builder.ts: ~200 lines (combines data)
- business-discovery.ts: ~80 lines (type definitions)

---

## TESTING STRATEGY

### Unit Tests (per file)
- Each deobfuscation method
- Company detection sources
- Pattern matching logic
- Intelligence record building

### Integration Tests
- Full workflow from search to Intelligence Record
- Queue handling of Discovery Records
- Worker processing stages
- Dashboard display

### Acceptance Tests
- Business discovery results accuracy
- Company detection confidence
- Email extraction comprehensive ness
- Dashboard UI correctness

---

## NEXT STEPS

1. Review this plan
2. Approve implementation order
3. Begin Phase 1: Create business-discovery.ts types
4. Test new types don't break existing system
5. Proceed incrementally through phases

---

## SUCCESS CRITERIA

✓ All existing functionality preserved  
✓ Discovery metadata captured for all Google results  
✓ Company detection working with confidence scoring  
✓ All email extraction methods included  
✓ Pattern matching at all 3 stages  
✓ Dashboard shows comprehensive intelligence  
✓ Queue handles new Discovery Records  
✓ Worker processes jobs in stages  
✓ Production-ready quality (type-safe, tested)  

