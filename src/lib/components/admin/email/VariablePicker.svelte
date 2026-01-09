<script lang="ts">
  /**
   * VariablePicker - Recognition-Based Variable Selection
   *
   * Perceptual Engineering Principles:
   * - Recognition over Recall: Visual grid of available variables
   * - Working Memory (4±1): Variables grouped into 4 categories
   * - Semantic Types: Color-coded by type (string/url/date/money)
   * - Contextual Filtering: Only shows variables valid for template context
   * - Immediate Feedback: Hover states show full description
   */

  import {
    VARIABLE_CATEGORIES,
    getVariablesByCategory,
    getTypeMeta,
    type VariableDefinition,
    type VariableCategory,
    type TemplateContext
  } from '$lib/email/editor/variables';

  // Props
  interface Props {
    /** Template context determines which variables are available */
    context?: TemplateContext;
    /** Currently selected variable name (for highlighting) */
    selected?: string;
    /** Callback when a variable is selected */
    onSelect?: (variable: VariableDefinition) => void;
    /** Whether to show as dropdown (compact) or inline (full) */
    mode?: 'dropdown' | 'inline';
    /** Filter to specific types (e.g., only URLs for button blocks) */
    typeFilter?: VariableDefinition['type'][];
    /** Placeholder text for dropdown trigger */
    placeholder?: string;
  }

  let {
    context = 'custom',
    selected = '',
    onSelect,
    mode = 'dropdown',
    typeFilter,
    placeholder = 'Select variable...'
  }: Props = $props();

  // State
  let isOpen = $state(false);
  let searchQuery = $state('');

  // Get variables grouped by category
  let variablesByCategory = $derived(getVariablesByCategory(context));

  // Filter variables based on search and type filter
  let filteredByCategory = $derived.by(() => {
    const filtered = new Map<VariableCategory, VariableDefinition[]>();

    for (const [category, vars] of variablesByCategory) {
      let categoryVars = vars;

      // Apply type filter if specified
      if (typeFilter && typeFilter.length > 0) {
        categoryVars = categoryVars.filter((v) => typeFilter.includes(v.type));
      }

      // Apply search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        categoryVars = categoryVars.filter(
          (v) =>
            v.name.toLowerCase().includes(query) ||
            v.label.toLowerCase().includes(query) ||
            v.description.toLowerCase().includes(query)
        );
      }

      if (categoryVars.length > 0) {
        filtered.set(category, categoryVars);
      }
    }

    return filtered;
  });

  // Get the selected variable's display info
  let selectedVariable = $derived.by(() => {
    if (!selected) return null;
    for (const vars of variablesByCategory.values()) {
      const found = vars.find((v) => v.name === selected);
      if (found) return found;
    }
    return null;
  });

  // Handlers
  function handleSelect(variable: VariableDefinition) {
    onSelect?.(variable);
    isOpen = false;
    searchQuery = '';
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      isOpen = false;
      searchQuery = '';
    }
  }

  function toggleDropdown() {
    isOpen = !isOpen;
    if (!isOpen) {
      searchQuery = '';
    }
  }
</script>

{#if mode === 'dropdown'}
  <!-- Dropdown Mode: Compact trigger with expandable panel -->
  <div class="variable-picker-dropdown relative">
    <!-- Trigger Button -->
    <button
      type="button"
      onclick={toggleDropdown}
      class="flex w-full items-center justify-between rounded-md border border-gray-300 bg-white px-3 py-2 text-left text-sm transition-colors hover:border-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none"
    >
      {#if selectedVariable}
        <span class="flex items-center gap-2">
          <span class="text-xs">{getTypeMeta(selectedVariable.type)?.emoji}</span>
          <code class="rounded bg-gray-100 px-1 text-xs">{'{{' + selectedVariable.name + '}}'}</code>
          <span class="text-gray-500">{selectedVariable.label}</span>
        </span>
      {:else}
        <span class="text-gray-400">{placeholder}</span>
      {/if}
      <svg
        class="h-4 w-4 text-gray-400 transition-transform {isOpen ? 'rotate-180' : ''}"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </button>

    <!-- Dropdown Panel -->
    {#if isOpen}
      <div
        class="absolute z-50 mt-1 max-h-80 w-80 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg"
        role="listbox"
        onkeydown={handleKeydown}
      >
        <!-- Search -->
        <div class="sticky top-0 border-b border-gray-100 bg-white p-2">
          <input
            type="text"
            bind:value={searchQuery}
            placeholder="Search variables..."
            class="w-full rounded border border-gray-200 px-2 py-1.5 text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-200 focus:outline-none"
          />
        </div>

        <!-- Variable Categories -->
        <div class="p-2">
          {#each VARIABLE_CATEGORIES as category}
            {#if filteredByCategory.has(category.id)}
              <div class="mb-3 last:mb-0">
                <div class="mb-1 flex items-center gap-1.5 px-1 text-xs font-medium text-gray-500">
                  <span>{category.emoji}</span>
                  <span>{category.label}</span>
                </div>
                <div class="space-y-0.5">
                  {#each filteredByCategory.get(category.id) ?? [] as variable}
                    {@const typeMeta = getTypeMeta(variable.type)}
                    <button
                      type="button"
                      onclick={() => handleSelect(variable)}
                      class="group flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-blue-50 {selected ===
                      variable.name
                        ? 'bg-blue-100'
                        : ''}"
                      role="option"
                      aria-selected={selected === variable.name}
                    >
                      <span class="mt-0.5 text-xs {typeMeta?.color ?? 'text-gray-500'}">
                        {typeMeta?.emoji}
                      </span>
                      <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-2">
                          <code
                            class="rounded bg-gray-100 px-1 text-xs group-hover:bg-blue-100"
                          >
                            {'{{' + variable.name + '}}'}
                          </code>
                        </div>
                        <div class="truncate text-xs text-gray-500">
                          {variable.description}
                        </div>
                      </div>
                    </button>
                  {/each}
                </div>
              </div>
            {/if}
          {/each}

          {#if filteredByCategory.size === 0}
            <div class="py-4 text-center text-sm text-gray-400">
              No variables match your search
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </div>
{:else}
  <!-- Inline Mode: Full panel always visible -->
  <div class="variable-picker-inline rounded-lg border border-gray-200 bg-gray-50 p-3">
    <!-- Header -->
    <div class="mb-2 flex items-center justify-between">
      <span class="text-xs font-medium text-gray-600">Available Variables</span>
      <input
        type="text"
        bind:value={searchQuery}
        placeholder="Search..."
        class="w-32 rounded border border-gray-200 bg-white px-2 py-1 text-xs focus:border-blue-400 focus:ring-1 focus:ring-blue-200 focus:outline-none"
      />
    </div>

    <!-- Variable Grid by Category -->
    <div class="space-y-3">
      {#each VARIABLE_CATEGORIES as category}
        {#if filteredByCategory.has(category.id)}
          <div>
            <div class="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-gray-500">
              <span>{category.emoji}</span>
              <span>{category.label}</span>
            </div>
            <div class="flex flex-wrap gap-1.5">
              {#each filteredByCategory.get(category.id) ?? [] as variable}
                {@const typeMeta = getTypeMeta(variable.type)}
                <button
                  type="button"
                  onclick={() => handleSelect(variable)}
                  class="group flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors {selected ===
                  variable.name
                    ? 'border-blue-400 bg-blue-50'
                    : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50'}"
                  title="{variable.description}\nExample: {variable.example}"
                >
                  <span class="{typeMeta?.color ?? 'text-gray-500'}">{typeMeta?.emoji}</span>
                  <code class="text-gray-700">{variable.name}</code>
                </button>
              {/each}
            </div>
          </div>
        {/if}
      {/each}

      {#if filteredByCategory.size === 0}
        <div class="py-3 text-center text-xs text-gray-400">
          No variables available for this context
        </div>
      {/if}
    </div>
  </div>
{/if}

<!-- Click outside to close dropdown -->
{#if mode === 'dropdown' && isOpen}
  <div class="fixed inset-0 z-40" onclick={() => (isOpen = false)} role="presentation"></div>
{/if}
