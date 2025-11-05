<svelte:head>
  <title>Unauthorized - Kiosk</title>
</svelte:head>

<div class="min-h-screen bg-gradient-to-br from-red-50 via-white to-orange-50 flex items-center justify-center p-8">
  <div class="max-w-md w-full text-center">
    <div class="inline-flex items-center justify-center w-24 h-24 bg-red-100 rounded-full mb-6">
      <svg class="w-12 h-12 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    </div>

    <h1 class="text-3xl font-bold text-gray-900 mb-4">Unauthorized Access</h1>
    <p class="text-gray-600 mb-8">
      This kiosk session is invalid or has expired. Please request a new session from the admin dashboard.
    </p>

    <div class="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-900">
      <p class="font-medium mb-1">Need help?</p>
      <p>Contact your system administrator to generate a new kiosk session token.</p>
    </div>
  </div>
</div>
