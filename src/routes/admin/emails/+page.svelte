<script lang="ts">
  import type { PageData } from './$types';
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';

  export let data: PageData;
  export let form;

  let mode: 'list' | 'create' | 'edit' = 'list';
  let selectedTemplate: any = null;
  let showPreview = true; // Auto-show preview
  let showTestModal = false;

  // Form state
  let slug = '';
  let subject = '';
  let htmlBody = '';
  let variables = '';
  let testEmail = '';

  // Preview with variable replacement
  $: previewHtml = replaceVariables(htmlBody, variables);

  function replaceVariables(html: string, varsJson: string): string {
    try {
      const vars = varsJson ? JSON.parse(varsJson) : {};
      let result = html;
      for (const [key, value] of Object.entries(vars)) {
        result = result.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
      }
      return result;
    } catch {
      return html;
    }
  }

  function createNew() {
    mode = 'create';
    slug = '';
    subject = '';
    htmlBody = '';
    variables = '';
    selectedTemplate = null;
  }

  function editTemplate(template: any) {
    mode = 'edit';
    selectedTemplate = template;
    slug = template.slug;
    subject = template.subject;
    htmlBody = template.html_body;
    variables = template.variables ? JSON.stringify(template.variables, null, 2) : '';
  }

  function cancelEdit() {
    mode = 'list';
    selectedTemplate = null;
  }

  // Handle form submission success
  $: if (form?.success || form?.deleted) {
    mode = 'list';
    selectedTemplate = null;
    invalidateAll();
  } else if (form?.testSent) {
    showTestModal = false;
    testEmail = '';
  }
</script>

<svelte:head>
  <title>Email Templates - Frontier Meals Admin</title>
</svelte:head>

<div class="space-y-6">
  <!-- Page header -->
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-3xl font-extrabold tracking-tight text-[#1A1816]">Email Templates</h1>
      <p class="text-[#5C5A56] mt-2">Create and manage email templates</p>
    </div>
    {#if mode === 'list'}
      <button
        on:click={createNew}
        class="px-6 py-3 bg-[#E67E50] border-2 border-[#D97F3E] text-white font-bold rounded-sm hover:bg-[#D97F3E] hover:shadow-xl shadow-lg transition-all flex items-center gap-2"
      >
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
        New Template
      </button>
    {:else}
      <button
        on:click={cancelEdit}
        class="px-6 py-3 text-[#1A1816] bg-[#D9D7D2] border-2 border-[#B8B6B1] hover:bg-[#B8B6B1] font-bold rounded-sm transition-colors"
      >
        ← Back to List
      </button>
    {/if}
  </div>

  {#if mode === 'list'}
    <!-- Template list -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {#each data.templates as template}
        <div class="bg-white border-2 border-[#D9D7D2] rounded-sm p-6 shadow-lg">
          <div class="flex items-start justify-between mb-4">
            <div class="flex-1">
              <h3 class="text-lg font-extrabold tracking-tight text-[#1A1816] mb-1">{template.slug}</h3>
              <p class="text-sm text-[#5C5A56]">{template.subject}</p>
            </div>
            <span class="px-2 py-1 text-xs font-bold bg-[#2D9B9B] text-white border-2 border-[#2D9B9B]/70 rounded-sm">
              Custom
            </span>
          </div>

          <div class="flex gap-2">
            <button
              on:click={() => editTemplate(template)}
              class="flex-1 px-4 py-2 text-sm font-bold text-[#E67E50] hover:bg-[#E67E50]/10 border-2 border-transparent hover:border-[#E67E50]/20 rounded-sm transition-all"
            >
              Edit
            </button>
            <form method="POST" action="?/deleteTemplate" use:enhance class="flex-1">
              <input type="hidden" name="id" value={template.id} />
              <input type="hidden" name="csrf_token" value={data.csrfToken} />
              <button
                type="submit"
                class="w-full px-4 py-2 text-sm font-bold text-[#C85454] hover:bg-[#C85454]/10 border-2 border-transparent hover:border-[#C85454]/20 rounded-sm transition-all"
                on:click={(e) => !confirm('Delete this template?') && e.preventDefault()}
              >
                Delete
              </button>
            </form>
          </div>
        </div>
      {/each}

      {#if data.templates.length === 0}
        <div class="col-span-full bg-white border-2 border-[#D9D7D2] rounded-sm p-12 text-center shadow-lg">
          <svg class="w-16 h-16 mx-auto mb-4 text-[#D9D7D2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <p class="font-bold text-[#1A1816] mb-1">No templates yet</p>
          <p class="text-sm text-[#5C5A56]">Create your first email template to get started</p>
        </div>
      {/if}
    </div>
  {:else}
    <!-- Template editor -->
    <form method="POST" action={mode === 'create' ? '?/createTemplate' : '?/updateTemplate'} use:enhance class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Left column: Editor -->
      <div class="space-y-6">
        <div class="bg-white border-2 border-[#D9D7D2] rounded-sm p-6 shadow-lg">
          <h2 class="text-xl font-extrabold tracking-tight text-[#1A1816] mb-6">
            {mode === 'create' ? 'Create Template' : 'Edit Template'}
          </h2>

          {#if mode === 'edit'}
            <input type="hidden" name="id" value={selectedTemplate?.id} />
          {/if}
          <input type="hidden" name="csrf_token" value={data.csrfToken} />

          <div class="space-y-4">
            {#if mode === 'create'}
              <div>
                <label for="slug" class="block text-sm font-bold text-[#1A1816] mb-2">
                  Slug (unique identifier)
                </label>
                <input
                  id="slug"
                  name="slug"
                  type="text"
                  bind:value={slug}
                  required
                  placeholder="welcome_email"
                  class="w-full px-4 py-2 border-2 border-[#B8B6B1] rounded-sm focus:ring-2 focus:ring-[#E67E50] focus:border-[#E67E50] outline-none font-medium text-[#1A1816] bg-white"
                />
              </div>
            {/if}

            <div>
              <label for="subject" class="block text-sm font-bold text-[#1A1816] mb-2">
                Subject Line
              </label>
              <input
                id="subject"
                name="subject"
                type="text"
                bind:value={subject}
                required
                placeholder="Welcome to Frontier Meals"
                class="w-full px-4 py-2 border-2 border-[#B8B6B1] rounded-sm focus:ring-2 focus:ring-[#E67E50] focus:border-[#E67E50] outline-none font-medium text-[#1A1816] bg-white"
              />
            </div>

            <div>
              <label for="htmlBody" class="block text-sm font-bold text-[#1A1816] mb-2">
                HTML Body
                <span class="text-xs text-[#5C5A56] ml-2">Use {'{{'}variable_name{'}}' } for dynamic content</span>
              </label>
              <textarea
                id="htmlBody"
                name="htmlBody"
                bind:value={htmlBody}
                required
                rows="15"
                placeholder="<html>...</html>"
                class="w-full px-4 py-2 border-2 border-[#B8B6B1] rounded-sm focus:ring-2 focus:ring-[#E67E50] focus:border-[#E67E50] outline-none font-mono text-sm text-[#1A1816] bg-white"
              ></textarea>
            </div>

            <div>
              <label for="variables" class="block text-sm font-bold text-[#1A1816] mb-2">
                Test Variables (JSON)
                <span class="text-xs text-[#5C5A56] ml-2">For preview only</span>
              </label>
              <textarea
                id="variables"
                name="variables"
                bind:value={variables}
                rows="5"
                placeholder="{'{'}&#34;customer_name&#34;: &#34;John Doe&#34;, &#34;amount&#34;: &#34;$15.00&#34;{'}'}"
                class="w-full px-4 py-2 border-2 border-[#B8B6B1] rounded-sm focus:ring-2 focus:ring-[#E67E50] focus:border-[#E67E50] outline-none font-mono text-sm text-[#1A1816] bg-white"
              ></textarea>
            </div>
          </div>

          <div class="flex gap-3 mt-6">
            <button
              type="submit"
              class="flex-1 px-6 py-3 bg-[#E67E50] border-2 border-[#D97F3E] text-white font-bold rounded-sm hover:bg-[#D97F3E] hover:shadow-xl shadow-lg transition-all"
            >
              {mode === 'create' ? 'Create Template' : 'Save Changes'}
            </button>
            <button
              type="button"
              on:click={() => showPreview = !showPreview}
              class="px-6 py-3 text-[#E67E50] bg-[#E67E50]/10 border-2 border-[#E67E50]/20 hover:bg-[#E67E50]/20 font-bold rounded-sm transition-colors"
            >
              {showPreview ? 'Hide' : 'Show'} Preview
            </button>
            <button
              type="button"
              on:click={() => showTestModal = true}
              class="px-6 py-3 text-[#1A1816] bg-[#D9D7D2] border-2 border-[#B8B6B1] hover:bg-[#B8B6B1] font-bold rounded-sm transition-colors"
            >
              Send Test
            </button>
          </div>
        </div>
      </div>

      <!-- Right column: Preview -->
      <div class="space-y-6">
        <div class="bg-white border-2 border-[#D9D7D2] rounded-sm p-6 sticky top-24 shadow-lg">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-xl font-extrabold tracking-tight text-[#1A1816]">Live Preview</h2>
            <span class="px-2 py-1 text-xs font-bold bg-[#52A675] text-white border-2 border-[#52A675]/70 rounded-sm">
              Live
            </span>
          </div>

          {#if showPreview}
            <div class="border-2 border-[#D9D7D2] rounded-sm overflow-hidden">
              <!-- Subject preview -->
              <div class="bg-white p-4 border-b-2 border-[#D9D7D2]">
                <p class="text-xs font-bold text-[#5C5A56] mb-1">Subject:</p>
                <p class="text-sm font-extrabold text-[#1A1816]">{subject || '(No subject)'}</p>
              </div>

              <!-- HTML preview -->
              <div class="p-4 max-h-[600px] overflow-y-auto bg-white">
                {#if htmlBody}
                  <iframe
                    title="Email Preview"
                    srcdoc={previewHtml}
                    sandbox="allow-same-origin"
                    class="w-full h-[500px] border-0"
                  ></iframe>
                {:else}
                  <p class="text-[#5C5A56] text-center py-12">Start typing to see preview</p>
                {/if}
              </div>
            </div>
          {:else}
            <div class="text-center py-12 text-[#5C5A56]">
              <svg class="w-16 h-16 mx-auto mb-4 text-[#D9D7D2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              <p class="font-bold">Click "Show Preview" to see how your email looks</p>
            </div>
          {/if}
        </div>
      </div>
    </form>
  {/if}
</div>

<!-- Test Email Modal -->
{#if showTestModal}
  <div class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50" on:click={() => showTestModal = false}>
    <div class="bg-white border-2 border-[#D9D7D2] rounded-sm shadow-2xl max-w-md w-full p-6" on:click|stopPropagation>
      <h3 class="text-xl font-extrabold tracking-tight text-[#1A1816] mb-4">Send Test Email</h3>

      <form method="POST" action="?/sendTest" use:enhance>
        <input type="hidden" name="subject" value={subject} />
        <input type="hidden" name="htmlBody" value={previewHtml} />
        <input type="hidden" name="csrf_token" value={data.csrfToken} />

        <div class="mb-6">
          <label for="testEmail" class="block text-sm font-bold text-[#1A1816] mb-2">
            Recipient Email
          </label>
          <input
            id="testEmail"
            name="email"
            type="email"
            bind:value={testEmail}
            required
            placeholder="your@email.com"
            class="w-full px-4 py-2 border-2 border-[#B8B6B1] rounded-sm focus:ring-2 focus:ring-[#E67E50] focus:border-[#E67E50] outline-none font-medium text-[#1A1816] bg-white"
          />
        </div>

        <div class="flex gap-3">
          <button
            type="button"
            on:click={() => showTestModal = false}
            class="flex-1 px-4 py-2 text-[#1A1816] bg-[#D9D7D2] border-2 border-[#B8B6B1] hover:bg-[#B8B6B1] rounded-sm font-bold transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            class="flex-1 px-4 py-2 text-white bg-[#E67E50] border-2 border-[#D97F3E] hover:bg-[#D97F3E] hover:shadow-xl shadow-lg rounded-sm font-bold transition-colors"
          >
            Send Test
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}
