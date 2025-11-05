<script lang="ts">
  import Card from '$lib/components/ui/card.svelte';

  let { data } = $props();
</script>

<div class="min-h-screen bg-[#F5F3EF] frontier-texture flex items-center justify-center px-4">
  <Card variant="concrete" class="max-w-2xl w-full p-8">
    <div class="text-center space-y-6">
      <div class="w-16 h-16 bg-[#52A675] border-2 border-[#52A675]/70 rounded-sm flex items-center justify-center mx-auto shadow-lg">
        <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
        </svg>
      </div>

      <div>
        <h1 class="text-3xl font-extrabold tracking-tight text-[#1A1816] mb-2">Welcome to Frontier Meals!</h1>
        <p class="text-[#5C5A56]">Your subscription is now active.</p>
      </div>

      <div class="bg-[#E8E6E1] border-2 border-[#D9D7D2] rounded-sm p-6 text-left space-y-4">
        <h2 class="font-bold tracking-tight text-[#1A1816]">What happens next?</h2>

        <ol class="space-y-3">
          <li class="flex items-start">
            <span class="flex-shrink-0 w-6 h-6 bg-[#E67E50] border-2 border-[#D97F3E] text-white rounded-sm flex items-center justify-center text-sm font-bold mr-3">1</span>
            <div>
              <p class="font-bold text-[#1A1816]">Check your email</p>
              <p class="text-sm text-[#5C5A56]">We've sent you a link to connect with our Telegram bot</p>
            </div>
          </li>

          <li class="flex items-start">
            <span class="flex-shrink-0 w-6 h-6 bg-[#E8C547] border-2 border-[#E8C547]/50 text-[#1A1816] rounded-sm flex items-center justify-center text-sm font-bold mr-3">2</span>
            <div>
              <p class="font-bold text-[#1A1816]">Complete onboarding in Telegram</p>
              <p class="text-sm text-[#5C5A56]">Select your dietary preferences and allergies</p>
            </div>
          </li>

          <li class="flex items-start">
            <span class="flex-shrink-0 w-6 h-6 bg-[#E67E50] border-2 border-[#D97F3E] text-white rounded-sm flex items-center justify-center text-sm font-bold mr-3">3</span>
            <div>
              <p class="font-bold text-[#1A1816]">Receive your daily QR code</p>
              <p class="text-sm text-[#5C5A56]">Every day at 12 PM PT via email</p>
            </div>
          </li>

          <li class="flex items-start">
            <span class="flex-shrink-0 w-6 h-6 bg-[#E8C547] border-2 border-[#E8C547]/50 text-[#1A1816] rounded-sm flex items-center justify-center text-sm font-bold mr-3">4</span>
            <div>
              <p class="font-bold text-[#1A1816]">Pick up your meal</p>
              <p class="text-sm text-[#5C5A56]">Scan your QR code at any kiosk before 11:59 PM PT</p>
            </div>
          </li>
        </ol>
      </div>

      <div class="pt-4">
        <p class="text-sm text-[#5C5A56]">
          Need help? Message <a href="https://t.me/noahchonlee" class="text-[#E67E50] hover:text-[#D97F3E] underline font-medium">@noahchonlee</a> on Telegram
        </p>
      </div>
    </div>
  </Card>
</div>
