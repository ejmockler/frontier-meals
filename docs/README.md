# Frontier Meals Documentation

Welcome to the Frontier Meals technical documentation. This directory contains specifications, guides, and architectural documentation for the project.

---

## Quick Links

### Main Documentation
- **Project README:** `/README.md` (root level)
- **PayPal Implementation Tracker:** `/PAYPAL_IMPLEMENTATION_TRACKER.md` (root level) - Authoritative tracker for PayPal integration

### Infrastructure & Operations
- **Infrastructure Guide:** `INFRASTRUCTURE.md` - System architecture, deployment, monitoring
- **Cron Jobs:** See archived PayPal docs for comprehensive cron job documentation

---

## Active Documentation

### Feature Specifications

#### Discount Codes (In Development)
- `discount-codes-spec.md` - **Discount code system specification**
  - Database schema with reservation system
  - Admin UI for code management
  - Customer checkout integration
  - Race condition prevention

#### Email & Templates
- Template service docs in root: `/TEMPLATE_SERVICE_README.md`

#### Landing & Marketing
- `LANDING_PAGE_SPEC.md` - Landing page specification

#### Telegram Bot
- `telegram-bot-ux-spec.md` - Telegram bot UX specification

---

## Archived Documentation

### PayPal Implementation (2026-01-30)
**Location:** `archive/paypal-implementation/`

Complete documentation of the 5-wave PayPal integration process (52/53 items implemented):
- Migration analysis and planning
- Token lifecycle and security analysis
- Cron jobs audit and cleanup
- Webhook rate limiting
- Implementation summaries (Waves 1-5)
- UX flows and diagrams

**Status:** ✅ COMPLETE - Integration is production-ready
**Main Tracker:** See `/PAYPAL_IMPLEMENTATION_TRACKER.md` in project root

### Brutalist Code Reviews (2025-11)
**Location:** `archive/brutalist-reviews/`

Historical code review documentation from Brutalist MCP analysis. Most issues were addressed during PayPal implementation.

---

## Root-Level Documentation

The following specialized documentation remains at the project root:

### Block Editor
- `/BLOCK_EDITOR_ARCHITECTURE.md` - Block editor architecture
- `/BLOCK_EDITOR_DESIGN.md` - Design patterns
- `/BLOCK_EDITOR_INTEGRATION_GUIDE.md` - Integration guide
- `/BLOCK_EDITOR_SUMMARY.md` - Feature summary

### Accessibility
- `/ACCESSIBILITY_IMPROVEMENTS.md` - Accessibility enhancements

### Templates
- `/TEMPLATE_SERVICE_README.md` - Template service documentation

### Project Management
- `/CONTRIBUTING.md` - Contribution guidelines
- `/README.md` - Project README

---

## Documentation Standards

### File Organization
- **Active specs:** Keep in `/docs/` root
- **Implementation archives:** Move to `/docs/archive/{topic}/`
- **Large features:** Create subdirectories (e.g., `/docs/block-editor/`)

### Naming Conventions
- Use kebab-case for new files: `feature-name-spec.md`
- Use UPPERCASE for important root docs: `README.md`, `CONTRIBUTING.md`
- Use descriptive names that indicate purpose

### When to Archive
Archive documentation when:
- ✅ Feature is complete and deployed
- ✅ Documentation is historical/reference only
- ✅ Multiple related docs can be consolidated
- ✅ Docs no longer guide active development

Keep documentation active when:
- ⚡ Feature is in development
- ⚡ Specification drives ongoing work
- ⚡ Reference is needed for maintenance
- ⚡ Documentation describes current architecture

---

## Contributing to Documentation

### Creating New Documentation
1. Determine if it's a specification, guide, or reference
2. Choose appropriate location (`/docs/` or root)
3. Follow naming conventions
4. Update this index (docs/README.md)

### Updating Existing Documentation
1. Keep the main tracker up-to-date
2. Mark sections as complete when implemented
3. Add "Last Updated" dates to long-living docs
4. Archive completed implementation docs

### Archiving Documentation
1. Create archive directory if needed
2. Move related docs together
3. Create README.md in archive directory
4. Update this index
5. Update any cross-references

---

## Support & Questions

- **Code Questions:** Check implementation in `/src/`
- **PayPal Integration:** See `/PAYPAL_IMPLEMENTATION_TRACKER.md`
- **Infrastructure:** See `docs/INFRASTRUCTURE.md`
- **Feature Specs:** Check this directory
- **Historical Context:** Check `docs/archive/`

---

Last Updated: 2026-01-30
