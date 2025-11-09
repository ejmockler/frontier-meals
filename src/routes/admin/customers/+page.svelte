<script lang="ts">
  import type { PageData } from './$types';
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';

  export let data: PageData;
  export let form;

  let search = data.search;
  let status = data.status;
  let selectedCustomer: any = null;
  let showQRConfirm = false;
  let isRegenerating = false;

  // Handle search
  function handleSearch() {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (status && status !== 'all') params.set('status', status);
    window.location.href = `/admin/customers${params.toString() ? '?' + params.toString() : ''}`;
  }

  // Get subscription for customer
  function getSubscription(customer: any) {
    return Array.isArray(customer.subscriptions) ? customer.subscriptions[0] : customer.subscriptions;
  }

  // Get telegram link status
  function getTelegramStatus(customer: any) {
    return Array.isArray(customer.telegram_link_status) ? customer.telegram_link_status[0] : customer.telegram_link_status;
  }

  // Get status badge color
  function getStatusColor(status: string): string {
    switch (status) {
      case 'active': return 'bg-[#52A675] text-white border-2 border-[#52A675]/70';
      case 'past_due': return 'bg-[#D97F3E] text-white border-2 border-[#D97F3E]/70';
      case 'canceled': return 'bg-[#78766F] text-white border-2 border-[#78766F]/70';
      default: return 'bg-[#2D9B9B] text-white border-2 border-[#2D9B9B]/70';
    }
  }

  // Handle QR regeneration
  async function regenerateQR() {
    isRegenerating = true;
    showQRConfirm = false;

    // Submit form programmatically
    const formElement = document.getElementById('regenerate-form') as HTMLFormElement;
    formElement?.requestSubmit();
  }

  // Handle form response
  $: if (form?.success) {
    isRegenerating = false;
    selectedCustomer = null;
    // Show success toast (you could add a toast component here)
    setTimeout(() => invalidateAll(), 500);
  } else if (form?.error) {
    isRegenerating = false;
    alert(form.error);
  }
</script>

<svelte:head>
  <title>Customers - Frontier Meals Admin</title>
</svelte:head>

<div class="space-y-6">
  <!-- Page header -->
  <div>
    <h1 class="text-3xl font-extrabold tracking-tight text-[#1A1816]">Customers</h1>
    <p class="text-[#5C5A56] mt-2">Search and manage customer accounts</p>
  </div>

  <!-- Search and filters -->
  <div class="bg-[#E8E6E1] border-2 border-[#D9D7D2] rounded-sm p-6 shadow-lg">
    <div class="flex gap-4 flex-wrap">
      <div class="flex-1 min-w-[300px]">
        <div class="relative">
          <input
            type="text"
            bind:value={search}
            on:keypress={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search by name, email, or Telegram..."
            class="w-full pl-10 pr-4 py-2 border-2 border-[#B8B6B1] rounded-sm focus:ring-2 focus:ring-[#E67E50] focus:border-[#E67E50] outline-none font-medium text-[#1A1816] bg-white"
          />
          <svg class="absolute left-3 top-2.5 w-5 h-5 text-[#8E8C87]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      <select
        bind:value={status}
        on:change={handleSearch}
        class="px-4 py-2 border-2 border-[#B8B6B1] rounded-sm focus:ring-2 focus:ring-[#E67E50] focus:border-[#E67E50] outline-none font-medium text-[#1A1816] bg-white"
      >
        <option value="all">All statuses</option>
        <option value="active">Active</option>
        <option value="past_due">Past due</option>
        <option value="canceled">Canceled</option>
      </select>

      <button
        on:click={handleSearch}
        class="px-6 py-2 bg-[#E67E50] border-2 border-[#D97F3E] text-white font-bold rounded-sm hover:bg-[#D97F3E] hover:shadow-xl shadow-lg transition-all"
      >
        Search
      </button>
    </div>
  </div>

  <!-- Results count -->
  <div class="flex items-center justify-between">
    <p class="text-sm text-[#5C5A56] font-medium">
      {data.customers.length} {data.customers.length === 1 ? 'customer' : 'customers'} found
    </p>
  </div>

  <!-- Customer list -->
  <div class="bg-[#E8E6E1] border-2 border-[#D9D7D2] rounded-sm overflow-hidden shadow-lg">
    {#if data.customers.length === 0}
      <div class="p-12 text-center text-[#5C5A56]">
        <svg class="w-16 h-16 mx-auto mb-4 text-[#D9D7D2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <p class="font-bold text-lg">No customers found</p>
        <p class="text-sm mt-1">Try adjusting your search or filters</p>
      </div>
    {:else}
      <div class="divide-y-2 divide-[#D9D7D2]">
        {#each data.customers as customer}
          {@const sub = getSubscription(customer)}
          {@const telegramStatus = getTelegramStatus(customer)}
          <div class="p-6 hover:bg-[#F5F3EF] transition-colors">
            <div class="flex items-start justify-between gap-4">
              <div class="flex-1">
                <div class="flex items-center gap-3 mb-2">
                  <h3 class="text-lg font-extrabold tracking-tight text-[#1A1816]">{customer.name}</h3>
                  {#if sub}
                    <span class="px-2 py-1 text-xs font-bold rounded-sm {getStatusColor(sub.status)}">
                      {sub.status}
                    </span>
                  {/if}
                  {#if telegramStatus?.is_linked}
                    <span class="px-2 py-1 text-xs font-bold rounded-sm bg-[#2D9B9B] text-white border-2 border-[#2D9B9B]/70">
                      ✓ Telegram
                    </span>
                  {/if}
                </div>

                <div class="space-y-1 text-sm text-[#5C5A56]">
                  <p class="flex items-center gap-2">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    {customer.email}
                  </p>
                  {#if customer.telegram_handle}
                    <p class="flex items-center gap-2">
                      <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.161c-.18 1.897-.962 6.502-1.359 8.627-.168.9-.5 1.201-.82 1.23-.697.064-1.226-.461-1.901-.903-1.056-.692-1.653-1.123-2.678-1.799-1.185-.781-.417-1.21.258-1.911.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.139-5.062 3.345-.479.329-.913.489-1.302.481-.428-.009-1.252-.242-1.865-.442-.752-.244-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.831-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635.099-.002.321.023.465.14.121.099.154.233.17.326.016.094.036.308.02.475z"/>
                      </svg>
                      @{customer.telegram_handle}
                    </p>
                  {/if}
                  <p class="text-xs text-[#8E8C87]">
                    Customer ID: {customer.id}
                  </p>
                </div>
              </div>

              <button
                on:click={() => { selectedCustomer = customer; showQRConfirm = true; }}
                class="px-4 py-2 text-sm font-bold text-white bg-[#E67E50] border-2 border-[#D97F3E] hover:bg-[#D97F3E] hover:shadow-xl shadow-lg rounded-sm transition-all"
              >
                Regenerate QR
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<!-- QR Regeneration Confirmation Modal -->
{#if showQRConfirm && selectedCustomer}
  <div class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50" on:click={() => showQRConfirm = false}>
    <div class="bg-[#E8E6E1] border-2 border-[#D9D7D2] rounded-sm shadow-2xl max-w-md w-full p-6" on:click|stopPropagation>
      <div class="text-center mb-6">
        <div class="inline-flex items-center justify-center w-16 h-16 bg-[#E67E50] border-2 border-[#D97F3E] rounded-sm mb-4">
          <svg class="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
          </svg>
        </div>
        <h3 class="text-xl font-extrabold tracking-tight text-[#1A1816] mb-2">Regenerate QR Code?</h3>
        <p class="text-[#5C5A56]">
          This will generate a new QR code for today and email it to <strong class="text-[#1A1816]">{selectedCustomer.name}</strong>
        </p>
      </div>

      <div class="flex gap-3">
        <button
          on:click={() => showQRConfirm = false}
          class="flex-1 px-4 py-2 text-[#1A1816] bg-[#D9D7D2] border-2 border-[#B8B6B1] hover:bg-[#B8B6B1] rounded-sm font-bold transition-colors"
        >
          Cancel
        </button>
        <button
          on:click={regenerateQR}
          disabled={isRegenerating}
          class="flex-1 px-4 py-2 text-white bg-[#E67E50] border-2 border-[#D97F3E] hover:bg-[#D97F3E] hover:shadow-xl shadow-lg rounded-sm font-bold transition-colors disabled:opacity-50"
        >
          {isRegenerating ? 'Sending...' : 'Send QR Code'}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Hidden form for QR regeneration -->
{#if selectedCustomer}
  <form
    id="regenerate-form"
    method="POST"
    action="?/regenerateQR"
    use:enhance={() => {
      isRegenerating = true;
      return async ({ result, update }) => {
        await update();
        isRegenerating = false;
      };
    }}
    class="hidden"
  >
    <input type="hidden" name="customerId" value={selectedCustomer.id} />
    <input type="hidden" name="qrPrivateKey" value={import.meta.env.QR_PRIVATE_KEY || ''} />
    <input type="hidden" name="csrf_token" value={data.csrfToken} />
  </form>
{/if}
