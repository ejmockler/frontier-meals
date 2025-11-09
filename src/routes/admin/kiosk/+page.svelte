<script lang="ts">
  import type { PageData } from './$types';
  import { enhance } from '$app/forms';

  let { data, form }: { data: PageData, form: any } = $props();

  let kioskId = $state('');
  let location = $state('');
  let sessionUrl = $state('');
  let createdKioskId = $state('');
  let createdLocation = $state('');

  // Generate session URL when form succeeds
  $effect(() => {
    if (form?.sessionToken) {
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
      sessionUrl = `${baseUrl}/kiosk?session=${form.sessionToken}`;
      // Preserve the values that were used to create this session
      createdKioskId = kioskId;
      createdLocation = location;
    }
  });

  function copySessionUrl() {
    navigator.clipboard.writeText(sessionUrl);
    // Could show a toast notification here
    alert('Session URL copied to clipboard!');
  }

  function openKiosk() {
    window.open(sessionUrl, '_blank', 'fullscreen=yes,menubar=no,toolbar=no,location=no,status=no');
  }

  function reset() {
    kioskId = '';
    location = '';
    sessionUrl = '';
    createdKioskId = '';
    createdLocation = '';
    form = null;
  }

  // Saved kiosk configurations (stored in localStorage)
  let savedKiosks = $state<Array<{id: string, location: string}>>([
    { id: 'kiosk-longevity-11', location: 'Floor 11 - Longevity, Frontier Tower' }
  ]);

  let showAddKiosk = $state(false);
  let newKioskId = $state('');
  let newKioskLocation = $state('');

  // Load saved kiosks from localStorage on mount
  $effect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('frontiermeals_saved_kiosks');
      if (stored) {
        try {
          savedKiosks = JSON.parse(stored);
        } catch (e) {
          console.error('Failed to parse saved kiosks', e);
        }
      }
    }
  });

  function selectPredefined(kiosk: typeof savedKiosks[0]) {
    kioskId = kiosk.id;
    location = kiosk.location;
  }

  function saveNewKiosk() {
    if (!newKioskId || !newKioskLocation) return;

    // Add to saved kiosks
    savedKiosks = [...savedKiosks, { id: newKioskId, location: newKioskLocation }];

    // Save to localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('frontiermeals_saved_kiosks', JSON.stringify(savedKiosks));
    }

    // Select the new kiosk
    selectPredefined({ id: newKioskId, location: newKioskLocation });

    // Reset form
    newKioskId = '';
    newKioskLocation = '';
    showAddKiosk = false;
  }

  function removeKiosk(index: number) {
    savedKiosks = savedKiosks.filter((_, i) => i !== index);

    // Update localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('frontiermeals_saved_kiosks', JSON.stringify(savedKiosks));
    }
  }
</script>

<svelte:head>
  <title>Kiosk Launcher - Frontier Meals Admin</title>
</svelte:head>

<div class="max-w-4xl mx-auto space-y-8">
  <!-- Page header -->
  <div class="text-center">
    <div class="inline-flex items-center justify-center w-20 h-20 bg-[#E67E50] border-2 border-[#D97F3E] rounded-sm mb-4 shadow-lg">
      <span class="text-4xl">🖥️</span>
    </div>
    <h1 class="text-3xl font-extrabold tracking-tight text-[#1A1816]">Kiosk Launcher</h1>
    <p class="text-[#5C5A56] mt-2">Create authenticated sessions for meal pickup kiosks</p>
  </div>

  {#if !sessionUrl}
    <!-- Session creation form -->
    <div class="bg-white border-2 border-[#D9D7D2] rounded-sm p-8 shadow-lg">
      <h2 class="text-xl font-extrabold tracking-tight text-[#1A1816] mb-6">Configure Kiosk Session</h2>

      <!-- Saved kiosks -->
      <div class="mb-6">
        <div class="flex items-center justify-between mb-3">
          <label class="block text-sm font-bold text-[#1A1816]">
            Saved Kiosks
          </label>
          <button
            type="button"
            on:click={() => showAddKiosk = !showAddKiosk}
            class="px-3 py-1 text-xs font-bold text-[#E67E50] hover:bg-[#E67E50]/10 border-2 border-[#E67E50]/20 hover:border-[#E67E50]/40 rounded-sm transition-all"
          >
            {showAddKiosk ? 'Cancel' : '+ Add Kiosk'}
          </button>
        </div>

        {#if showAddKiosk}
          <div class="bg-white border-2 border-[#D9D7D2] rounded-sm p-4 mb-4">
            <div class="grid grid-cols-2 gap-3 mb-3">
              <input
                type="text"
                bind:value={newKioskId}
                placeholder="Kiosk ID"
                class="px-3 py-2 border-2 border-[#B8B6B1] rounded-sm focus:ring-2 focus:ring-[#E67E50] focus:border-[#E67E50] outline-none text-sm font-medium text-[#1A1816] bg-white"
              />
              <input
                type="text"
                bind:value={newKioskLocation}
                placeholder="Location"
                class="px-3 py-2 border-2 border-[#B8B6B1] rounded-sm focus:ring-2 focus:ring-[#E67E50] focus:border-[#E67E50] outline-none text-sm font-medium text-[#1A1816] bg-white"
              />
            </div>
            <button
              type="button"
              on:click={saveNewKiosk}
              disabled={!newKioskId || !newKioskLocation}
              class="w-full px-4 py-2 bg-[#52A675] border-2 border-[#52A675]/70 text-white text-sm font-bold rounded-sm hover:bg-[#52A675]/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save Kiosk
            </button>
          </div>
        {/if}

        {#if savedKiosks.length <= 3}
          <!-- Button grid for ≤3 kiosks -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
            {#each savedKiosks as kiosk, index}
              <div class="relative">
                <button
                  type="button"
                  on:click={() => selectPredefined(kiosk)}
                  class="w-full p-4 border-2 rounded-sm transition-all text-left
                    {kioskId === kiosk.id ? 'border-[#E67E50] bg-[#E67E50]/10' : 'border-[#D9D7D2] hover:border-[#E67E50]/50 hover:bg-[#E67E50]/5'}"
                >
                  <p class="font-extrabold text-[#1A1816] text-sm pr-6">{kiosk.id}</p>
                  <p class="text-xs text-[#5C5A56] mt-1">{kiosk.location}</p>
                </button>
                <button
                  type="button"
                  on:click={() => removeKiosk(index)}
                  class="absolute top-2 right-2 w-6 h-6 flex items-center justify-center text-[#C85454] hover:bg-[#C85454]/10 rounded-sm transition-all"
                  title="Remove kiosk"
                >
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            {/each}
          </div>
        {:else}
          <!-- Dropdown for >3 kiosks -->
          <div class="relative">
            <select
              on:change={(e) => {
                const selected = savedKiosks[parseInt(e.currentTarget.value)];
                if (selected) selectPredefined(selected);
              }}
              class="w-full px-4 py-3 border-2 border-[#B8B6B1] rounded-sm focus:ring-2 focus:ring-[#E67E50] focus:border-[#E67E50] outline-none font-medium text-[#1A1816] bg-white"
            >
              <option value="">Select a saved kiosk...</option>
              {#each savedKiosks as kiosk, index}
                <option value={index}>{kiosk.id} - {kiosk.location}</option>
              {/each}
            </select>
            <p class="text-xs text-[#5C5A56] mt-2">
              {savedKiosks.length} saved kiosks (showing dropdown for easier selection)
            </p>
          </div>
        {/if}
      </div>

      <div class="h-px bg-[#D9D7D2] my-6"></div>

      <!-- Custom configuration -->
      <form method="POST" action="?/createSession" use:enhance class="space-y-6">
        <input type="hidden" name="csrf_token" value={data.csrfToken} />
        <div>
          <label for="kioskId" class="block text-sm font-bold text-[#1A1816] mb-2">
            Kiosk ID
          </label>
          <input
            id="kioskId"
            name="kioskId"
            type="text"
            bind:value={kioskId}
            required
            placeholder="kiosk-01"
            class="w-full px-4 py-3 border-2 border-[#B8B6B1] rounded-sm focus:ring-2 focus:ring-[#E67E50] focus:border-[#E67E50] outline-none font-medium text-[#1A1816] bg-white"
          />
          <p class="text-xs text-[#5C5A56] mt-1">Unique identifier for this kiosk device</p>
        </div>

        <div>
          <label for="location" class="block text-sm font-bold text-[#1A1816] mb-2">
            Location
          </label>
          <input
            id="location"
            name="location"
            type="text"
            bind:value={location}
            required
            placeholder="Main Lobby"
            class="w-full px-4 py-3 border-2 border-[#B8B6B1] rounded-sm focus:ring-2 focus:ring-[#E67E50] focus:border-[#E67E50] outline-none font-medium text-[#1A1816] bg-white"
          />
          <p class="text-xs text-[#5C5A56] mt-1">Physical location of this kiosk</p>
        </div>

        <div class="bg-[#2D9B9B]/10 border-2 border-[#2D9B9B]/30 rounded-sm p-4">
          <div class="flex items-start gap-3">
            <svg class="w-5 h-5 text-[#2D9B9B] flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div class="text-sm text-[#1A1816]">
              <p class="font-bold mb-1">Session Details</p>
              <ul class="space-y-1 text-[#5C5A56]">
                <li>• Kiosk will be authenticated for QR scanning</li>
                <li>• All redemptions will be logged to this kiosk ID</li>
                <li>• Session remains active indefinitely</li>
              </ul>
            </div>
          </div>
        </div>

        <button
          type="submit"
          class="w-full px-6 py-4 bg-[#E67E50] border-2 border-[#D97F3E] text-white font-bold rounded-sm hover:bg-[#D97F3E] hover:shadow-xl shadow-lg transition-all"
        >
          Create Kiosk Session
        </button>
      </form>
    </div>
  {:else}
    <!-- Session created successfully -->
    <div class="bg-white border-2 border-[#D9D7D2] rounded-sm p-8 shadow-lg">
      <div class="text-center mb-8">
        <div class="inline-flex items-center justify-center w-16 h-16 bg-[#52A675] border-2 border-[#52A675]/70 rounded-sm mb-4 shadow-lg">
          <svg class="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 class="text-2xl font-extrabold tracking-tight text-[#1A1816] mb-2">Session Created!</h2>
        <p class="text-[#5C5A56]">Kiosk session is ready to launch</p>
      </div>

      <!-- Session info -->
      <div class="bg-white border-2 border-[#D9D7D2] rounded-sm p-6 mb-6">
        <div class="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p class="text-[#5C5A56]">Kiosk ID</p>
            <p class="font-extrabold text-[#1A1816]">{createdKioskId}</p>
          </div>
          <div>
            <p class="text-[#5C5A56]">Location</p>
            <p class="font-extrabold text-[#1A1816]">{createdLocation}</p>
          </div>
          <div>
            <p class="text-[#5C5A56]">Created</p>
            <p class="font-extrabold text-[#1A1816]">Just now</p>
          </div>
        </div>
      </div>

      <!-- Session URL -->
      <div class="mb-6">
        <label class="block text-sm font-bold text-[#1A1816] mb-2">
          Session URL
        </label>
        <div class="flex gap-2">
          <input
            type="text"
            value={sessionUrl}
            readonly
            class="flex-1 px-4 py-3 border-2 border-[#B8B6B1] rounded-sm bg-white font-mono text-sm text-[#5C5A56]"
          />
          <button
            on:click={copySessionUrl}
            class="px-4 py-3 text-[#1A1816] bg-[#D9D7D2] border-2 border-[#B8B6B1] hover:bg-[#B8B6B1] rounded-sm font-bold transition-colors"
            title="Copy to clipboard"
          >
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Actions -->
      <div class="flex gap-3">
        <button
          on:click={openKiosk}
          class="flex-1 px-6 py-4 bg-[#E67E50] border-2 border-[#D97F3E] text-white font-bold rounded-sm hover:bg-[#D97F3E] hover:shadow-xl shadow-lg transition-all flex items-center justify-center gap-2"
        >
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          Launch Kiosk
        </button>
        <button
          on:click={reset}
          class="px-6 py-4 text-[#1A1816] bg-[#D9D7D2] border-2 border-[#B8B6B1] hover:bg-[#B8B6B1] font-bold rounded-sm transition-colors"
        >
          Create Another
        </button>
      </div>

      <!-- Warning -->
      <div class="mt-6 bg-[#E8C547]/10 border-2 border-[#E8C547]/30 rounded-sm p-4">
        <div class="flex items-start gap-3">
          <svg class="w-5 h-5 text-[#D97F3E] flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div class="text-sm text-[#1A1816]">
            <p class="font-bold mb-1">Security Notice</p>
            <p class="text-[#5C5A56]">This session token grants full kiosk access. Only share it with trusted kiosk devices.</p>
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- Info cards -->
  <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
    <div class="bg-white border-2 border-[#D9D7D2] rounded-sm p-6 shadow-lg">
      <div class="flex items-center gap-3 mb-3">
        <div class="w-10 h-10 bg-[#2D9B9B] border-2 border-[#2D9B9B]/70 rounded-sm flex items-center justify-center">
          <svg class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h3 class="font-extrabold text-[#1A1816]">Authenticated</h3>
      </div>
      <p class="text-sm text-[#5C5A56]">Kiosk sessions use JWT authentication for secure access</p>
    </div>

    <div class="bg-white border-2 border-[#D9D7D2] rounded-sm p-6 shadow-lg">
      <div class="flex items-center gap-3 mb-3">
        <div class="w-10 h-10 bg-[#52A675] border-2 border-[#52A675]/70 rounded-sm flex items-center justify-center">
          <svg class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 class="font-extrabold text-[#1A1816]">QR Scanning</h3>
      </div>
      <p class="text-sm text-[#5C5A56]">Full access to scan customer QR codes and validate meals</p>
    </div>

    <div class="bg-white border-2 border-[#D9D7D2] rounded-sm p-6 shadow-lg">
      <div class="flex items-center gap-3 mb-3">
        <div class="w-10 h-10 bg-[#E67E50] border-2 border-[#D97F3E] rounded-sm flex items-center justify-center">
          <svg class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <h3 class="font-extrabold text-[#1A1816]">Audit Logged</h3>
      </div>
      <p class="text-sm text-[#5C5A56]">All redemptions tracked with kiosk ID and timestamp</p>
    </div>
  </div>
</div>
