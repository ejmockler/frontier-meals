# BlockEditor Test Plan

## Manual Testing Checklist

### Basic Functionality

#### Template Settings
- [ ] Click color swatches - selected state shows checkmark
- [ ] Click emoji picker - selected emoji gets highlighted background
- [ ] Type in title input - updates immediately
- [ ] Type in subtitle input - updates immediately
- [ ] Preview updates with new settings

#### Block Operations
- [ ] Click "Add Block" button - palette opens
- [ ] Click block type in palette - block added to list
- [ ] Edit block content - updates immediately
- [ ] Click delete button on block - block removed after confirmation
- [ ] Drag block by handle - visual feedback during drag
- [ ] Drop block in new position - order updates

#### Variables
- [ ] Type `{{test_var}}` in paragraph - variable appears in Variables section
- [ ] Enter test value for variable - preview updates with value
- [ ] Delete variable text from block - variable removed from list
- [ ] Greeting block auto-adds its variable name

#### Preview
- [ ] Preview shows live HTML
- [ ] Changes update in real-time (<100ms perceived)
- [ ] Preview matches expected email layout

### Block Type Testing

#### Greeting Block
- [ ] Default variable name is "customer_name"
- [ ] Change variable name - preview updates
- [ ] Variable appears in Variables section

#### Paragraph Block
- [ ] Type text - preview updates
- [ ] Change style (lead/normal/muted/small) - font size changes
- [ ] Use `{{variable}}` in text - variable detected

#### Info Box Block
- [ ] Change type (info/success/warning/error) - colors change
- [ ] Type title - preview updates
- [ ] Type text - preview updates
- [ ] Colors match semantic meaning (green=success, red=error, etc.)

#### Button Block
- [ ] Type label - button text updates
- [ ] Type URL variable - variable detected
- [ ] Click color override - color picker opens
- [ ] Change color - button color updates in preview

#### Step List Block
- [ ] Default has one step
- [ ] Click "Add Step" - new step appears
- [ ] Type step title/description - preview updates
- [ ] Delete step - step removed
- [ ] Steps numbered correctly (1, 2, 3...)

#### Code Inline Block
- [ ] Type code text - appears in monospace
- [ ] Preview shows inline code styling

#### Code Block Block
- [ ] Type multi-line code - preview shows code block
- [ ] Preview uses monospace font
- [ ] Background color applied

#### Image Block
- [ ] Type CID reference - used in preview
- [ ] Type alt text - used in img tag
- [ ] Change width/height - image size updates

#### Divider Block
- [ ] Shows visual divider in card
- [ ] Preview shows horizontal line

#### Spacer Block
- [ ] Shows visual spacing indicator
- [ ] Preview has vertical space

### Edge Cases

#### Empty States
- [ ] Empty editor shows "No blocks yet" message
- [ ] Empty paragraph renders correctly
- [ ] Empty variables list doesn't show section

#### Large Content
- [ ] 20+ blocks - still performs well
- [ ] Very long paragraph - wraps correctly
- [ ] Many variables - all detected

#### Variable Patterns
- [ ] `{{simple}}` - detected
- [ ] `{{with_underscore}}` - detected
- [ ] `{{123}}` - detected (if regex allows)
- [ ] `{{ spaces }}` - NOT detected (expected)
- [ ] `{{nested{{var}}}}` - only outer detected

#### HTML Generation
- [ ] Generated HTML is valid
- [ ] Inline styles present (no classes)
- [ ] Table-based layout
- [ ] MSO conditionals present
- [ ] Variable placeholders not replaced in export

### Integration Testing

#### State Management
```javascript
// In browser console:
import { editorState, editorActions } from './editor-store';

// Test state updates
editorActions.updateSettings({ title: 'Test' });
console.log($editorState.settings.title); // Should log "Test"

// Test block operations
editorActions.addBlock('greeting');
console.log($editorState.blocks.length); // Should log 1

// Test variables
editorActions.setVariable('test', 'value');
console.log($editorState.variables.test); // Should log "value"
```

#### HTML Export
```javascript
// Get HTML output
const html = blockEditor.getHTML();
console.log(html);

// Verify structure
html.includes('<!DOCTYPE html>'); // true
html.includes('role="presentation"'); // true
html.includes('style='); // true (inline styles)
```

#### State Persistence
```javascript
// Export state
const state = $editorState;
localStorage.setItem('editorState', JSON.stringify(state));

// Clear editor
editorActions.reset();

// Restore state
const saved = JSON.parse(localStorage.getItem('editorState'));
editorActions.loadState(saved);

// Verify restoration
console.log($editorState); // Should match original state
```

## Automated Testing (Future)

### Unit Tests

```typescript
// editor-store.test.ts
import { editorActions, editorState } from './editor-store';

test('addBlock adds block to state', () => {
  editorActions.reset();
  editorActions.addBlock('greeting');

  expect(editorState.blocks.length).toBe(1);
  expect(editorState.blocks[0].type).toBe('greeting');
});

test('updateBlock updates correct block', () => {
  editorActions.reset();
  editorActions.addBlock('paragraph');

  const blockId = editorState.blocks[0].id;
  editorActions.updateBlock(blockId, { text: 'Updated' });

  expect(editorState.blocks[0].text).toBe('Updated');
});

test('detectedVariables finds all variables', () => {
  editorActions.reset();
  editorActions.addBlock('paragraph');

  const blockId = editorState.blocks[0].id;
  editorActions.updateBlock(blockId, {
    text: 'Hello {{name}}, your total is {{amount}}'
  });

  expect(detectedVariables).toContain('name');
  expect(detectedVariables).toContain('amount');
});
```

### Component Tests

```typescript
// BlockEditor.test.ts
import { render, fireEvent } from '@testing-library/svelte';
import BlockEditor from './BlockEditor.svelte';

test('renders empty state', () => {
  const { getByText } = render(BlockEditor);
  expect(getByText('No blocks yet')).toBeInTheDocument();
});

test('adds block when palette option clicked', async () => {
  const { getByText, getByRole } = render(BlockEditor);

  await fireEvent.click(getByText('Add Block'));
  await fireEvent.click(getByText('Greeting'));

  expect(getByText('👋 Greeting')).toBeInTheDocument();
});

test('updates preview when content changes', async () => {
  const { getByLabelText, container } = render(BlockEditor);

  const titleInput = getByLabelText('Title');
  await fireEvent.input(titleInput, { target: { value: 'Test Title' } });

  const iframe = container.querySelector('iframe');
  expect(iframe.srcdoc).toContain('Test Title');
});
```

### Integration Tests

```typescript
// BlockEditor.integration.test.ts
test('full email creation flow', async () => {
  const { getByText, getByLabelText, getByRole } = render(BlockEditor);

  // Set template settings
  await fireEvent.click(getByText('Teal')); // Color swatch
  await fireEvent.input(getByLabelText('Title'), {
    target: { value: 'Welcome Email' }
  });

  // Add blocks
  await fireEvent.click(getByText('Add Block'));
  await fireEvent.click(getByText('Greeting'));

  await fireEvent.click(getByText('Add Block'));
  await fireEvent.click(getByText('Paragraph'));

  // Edit content
  const paragraphInput = getByLabelText('Text');
  await fireEvent.input(paragraphInput, {
    target: { value: 'Welcome to our service!' }
  });

  // Verify variables detected
  expect(getByText('{{customer_name}}')).toBeInTheDocument();

  // Set test value
  const varInput = getByLabelText('{{customer_name}}');
  await fireEvent.input(varInput, { target: { value: 'Jane Doe' } });

  // Verify preview
  const iframe = container.querySelector('iframe');
  expect(iframe.srcdoc).toContain('Jane Doe');
  expect(iframe.srcdoc).toContain('Welcome to our service!');
});
```

## Performance Testing

### Metrics to Track

1. **Block add time:** Should be <50ms
2. **Block update time:** Should be <50ms
3. **HTML generation time:** Should be <100ms for 10-block email
4. **Preview update time:** Should be <100ms perceived
5. **Drag feedback time:** Should be <16ms (60fps)

### Performance Test Script

```javascript
// Run in browser console
console.time('Add 50 blocks');
for (let i = 0; i < 50; i++) {
  editorActions.addBlock('paragraph');
}
console.timeEnd('Add 50 blocks'); // Should be <500ms

console.time('Update 50 blocks');
editorState.blocks.forEach(block => {
  editorActions.updateBlock(block.id, { text: 'Updated text ' + Date.now() });
});
console.timeEnd('Update 50 blocks'); // Should be <1000ms

console.time('Generate HTML');
const html = blockEditor.getHTML();
console.timeEnd('Generate HTML'); // Should be <200ms
```

## Visual Regression Testing (Future)

Use Percy or Chromatic to capture screenshots:

1. Empty state
2. Palette open
3. Each block type
4. Drag in progress
5. Color scheme variants
6. Mobile layout
7. Error states

## Accessibility Testing

### Screen Reader
- [ ] Tab through all controls
- [ ] Labels announce correctly
- [ ] Button purposes clear
- [ ] Form structure semantic

### Keyboard Only
- [ ] Tab to navigate
- [ ] Enter to activate buttons
- [ ] Arrow keys in selects
- [ ] Escape to close palette

### Color Contrast
- [ ] All text meets WCAG AAA (7:1)
- [ ] Focus indicators visible
- [ ] Disabled states clear

### ARIA
- [ ] Buttons have aria-label if icon-only
- [ ] Live regions for preview updates
- [ ] Roles on custom widgets

## Browser Testing

### Desktop
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)

### Mobile
- [ ] iOS Safari
- [ ] Android Chrome
- [ ] Touch gestures work

## Error Handling

### Expected Errors
- [ ] Invalid JSON in import - show error
- [ ] Network error on save - retry
- [ ] Large file - warn user

### Graceful Degradation
- [ ] No drag and drop support - show warning
- [ ] Old browser - basic functionality works
- [ ] JavaScript disabled - form still works (if integrated)

## Success Criteria

✅ All blocks render correctly
✅ Variables auto-detect reliably
✅ Preview updates in <100ms
✅ No TypeScript errors
✅ No console errors
✅ Accessible (WCAG AAA)
✅ Works in all modern browsers
✅ Mobile-friendly
✅ State persists correctly
✅ HTML output is valid email HTML
