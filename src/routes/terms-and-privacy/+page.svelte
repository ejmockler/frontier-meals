<script lang="ts">
  import { Container, Text } from '$lib/components/landing';

  // Versioning metadata - engineered for future diff generation
  const DOCUMENT_VERSION = {
    version: '1.0.0',
    lastUpdated: 'January 26, 2026',
    effectiveDate: 'January 26, 2026'
  };

  // Track which section is in view for potential navigation aid
  let activeSection = $state<string | null>(null);

  function scrollToSection(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
</script>

<svelte:head>
  <title>Terms & Privacy - Frontier Meals</title>
  <meta name="description" content="Frontier Meal Plan subscription agreement, terms of service, liability waiver, and privacy policy provided by UnCampus LLC." />
</svelte:head>

<div class="min-h-screen bg-[#F5F3EF]">
  <!-- Skip Link -->
  <a
    href="#document-content"
    class="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-[#E67E50] focus:text-white focus:rounded-md focus:font-bold cursor-pointer"
  >
    Skip to document content
  </a>

  <!-- Document Header - Establishes context before reading -->
  <header class="bg-[#1A1816] text-white py-12 md:py-16">
    <Container size="narrow">
      <div class="space-y-4">
        <!-- Back navigation -->
        <a
          href="/"
          class="inline-flex items-center gap-2 text-[#8E8C87] hover:text-white transition-colors duration-150 text-sm font-medium group"
        >
          <svg class="w-4 h-4 transition-transform duration-150 group-hover:-translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
          Back to Frontier Meals
        </a>

        <h1 class="text-3xl md:text-4xl font-extrabold tracking-tight">
          Subscription Agreement
        </h1>

        <p class="text-[#8E8C87] text-base">
          Frontier Meal Plan provided by UnCampus LLC
        </p>

        <!-- Version badge - prominent for trust and future diffing -->
        <div class="inline-flex items-center gap-3 bg-[#252321] px-4 py-2 rounded-md text-sm">
          <span class="text-[#8E8C87]">Last Updated</span>
          <span class="font-semibold text-[#E67E50]">{DOCUMENT_VERSION.lastUpdated}</span>
        </div>
      </div>
    </Container>
  </header>

  <!-- Quick Navigation - Peripheral scanning before deep reading -->
  <nav class="bg-white border-b border-[#D9D7D2] py-4 sticky top-0 z-10">
    <Container size="narrow">
      <div class="flex flex-wrap gap-2 md:gap-4">
        <button
          onclick={() => scrollToSection('terms')}
          class="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-[#5C5A56] hover:text-[#1A1816] hover:bg-[#F5F3EF] rounded transition-colors duration-150"
        >
          <span class="text-lg">📋</span>
          <span class="hidden sm:inline">Terms</span>
        </button>
        <button
          onclick={() => scrollToSection('liability')}
          class="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-[#5C5A56] hover:text-[#1A1816] hover:bg-[#F5F3EF] rounded transition-colors duration-150"
        >
          <span class="text-lg">⚠️</span>
          <span class="hidden sm:inline">Liability</span>
        </button>
        <button
          onclick={() => scrollToSection('privacy')}
          class="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-[#5C5A56] hover:text-[#1A1816] hover:bg-[#F5F3EF] rounded transition-colors duration-150"
        >
          <span class="text-lg">🔒</span>
          <span class="hidden sm:inline">Privacy</span>
        </button>
        <button
          onclick={() => scrollToSection('acceptance')}
          class="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-[#5C5A56] hover:text-[#1A1816] hover:bg-[#F5F3EF] rounded transition-colors duration-150"
        >
          <span class="text-lg">✓</span>
          <span class="hidden sm:inline">Acceptance</span>
        </button>
      </div>
    </Container>
  </nav>

  <!-- Document Content -->
  <main id="document-content" class="py-8 md:py-12">
    <Container size="narrow">
      <div class="space-y-8">

        <!-- SECTION 1: Terms and Conditions -->
        <section id="terms" class="scroll-mt-20">
          <article class="bg-white rounded-lg border-2 border-[#D9D7D2] overflow-hidden">
            <!-- Section Header - Icon enables peripheral recognition -->
            <header class="bg-[#F5F3EF] px-6 py-4 border-b border-[#D9D7D2]">
              <div class="flex items-center gap-3">
                <span class="text-2xl" aria-hidden="true">📋</span>
                <div>
                  <h2 class="text-xl font-bold text-[#1A1816] tracking-tight">
                    1. Terms and Conditions of Service
                  </h2>
                  <p class="text-sm text-[#5C5A56] mt-0.5">
                    Billing, cancellation, and service details
                  </p>
                </div>
              </div>
            </header>

            <div class="p-6 space-y-6">
              <!-- 1.1 Subscription Billing -->
              <div class="space-y-2">
                <h3 class="font-semibold text-[#1A1816] flex items-baseline gap-2">
                  <span class="text-[#E67E50] text-sm font-mono">1.1</span>
                  Subscription Billing
                </h3>
                <p class="text-[#5C5A56] leading-relaxed pl-6">
                  By enrolling in the UnCampus LLC Meal Plan, you authorize UnCampus LLC to charge your payment method on a <mark class="bg-[#E8C547]/30 px-1 rounded font-medium text-[#1A1816]">recurring monthly basis</mark> at the current subscription rate.
                </p>
              </div>

              <!-- 1.2 Cancellation Policy -->
              <div class="space-y-2">
                <h3 class="font-semibold text-[#1A1816] flex items-baseline gap-2">
                  <span class="text-[#E67E50] text-sm font-mono">1.2</span>
                  Cancellation Policy
                </h3>
                <p class="text-[#5C5A56] leading-relaxed pl-6">
                  You may cancel your subscription at any time through your member portal. To prevent billing for the subsequent month, cancellations must be submitted at least <mark class="bg-[#E67E50]/20 px-1 rounded font-semibold text-[#1A1816]">5 business days</mark> prior to your scheduled renewal date.
                </p>
              </div>

              <!-- 1.3 Refund Policy -->
              <div class="space-y-2">
                <h3 class="font-semibold text-[#1A1816] flex items-baseline gap-2">
                  <span class="text-[#E67E50] text-sm font-mono">1.3</span>
                  Refund Policy
                </h3>
                <p class="text-[#5C5A56] leading-relaxed pl-6">
                  <mark class="bg-[#C85454]/15 px-1 rounded font-semibold text-[#1A1816]">All fees are non-refundable.</mark> Because food orders are placed in advance with third-party vendors, we cannot offer pro-rated refunds or credits for unused meals or mid-month cancellations.
                </p>
              </div>

              <!-- 1.4 Service Modifications -->
              <div class="space-y-2">
                <h3 class="font-semibold text-[#1A1816] flex items-baseline gap-2">
                  <span class="text-[#E67E50] text-sm font-mono">1.4</span>
                  Service Modifications
                </h3>
                <p class="text-[#5C5A56] leading-relaxed pl-6">
                  We reserve the right to modify menus, substitute ingredients, or change third-party vendors based on availability and seasonal requirements.
                </p>
              </div>
            </div>
          </article>
        </section>

        <!-- SECTION 2: Liability Waiver -->
        <section id="liability" class="scroll-mt-20">
          <article class="bg-white rounded-lg border-2 border-[#D9D7D2] overflow-hidden">
            <header class="bg-[#F5F3EF] px-6 py-4 border-b border-[#D9D7D2]">
              <div class="flex items-center gap-3">
                <span class="text-2xl" aria-hidden="true">⚠️</span>
                <div>
                  <h2 class="text-xl font-bold text-[#1A1816] tracking-tight">
                    2. Liability Waiver and Release
                  </h2>
                  <p class="text-sm text-[#5C5A56] mt-0.5">
                    Risk acknowledgment and release of claims
                  </p>
                </div>
              </div>
            </header>

            <div class="p-6 space-y-6">
              <!-- 2.1 Release of Claims -->
              <div class="space-y-3">
                <h3 class="font-semibold text-[#1A1816] flex items-baseline gap-2">
                  <span class="text-[#E67E50] text-sm font-mono">2.1</span>
                  Release of Claims
                </h3>
                <p class="text-[#5C5A56] leading-relaxed pl-6">
                  I hereby release, waive, and discharge the following entities and individuals:
                </p>
                <!-- Releasees list - visually distinct for comprehension -->
                <div class="ml-6 bg-[#F5F3EF] rounded-md p-4 border border-[#D9D7D2]">
                  <p class="text-[#1A1816] text-sm font-medium leading-relaxed">
                    UnCampus LLC; Berlinhouse Inc.; Frontier Tower; 995 Market Street LLC; and individuals Noah Cremean, Laurence Ion, Layan Sherif, and Eric Mockler
                  </p>
                  <p class="text-[#5C5A56] text-sm mt-2">
                    (collectively, the "Releasees"), along with their respective employees and agents.
                  </p>
                </div>
              </div>

              <!-- 2.2 Assumption of Risk -->
              <div class="space-y-2">
                <h3 class="font-semibold text-[#1A1816] flex items-baseline gap-2">
                  <span class="text-[#E67E50] text-sm font-mono">2.2</span>
                  Assumption of Risk
                </h3>
                <p class="text-[#5C5A56] leading-relaxed pl-6">
                  I acknowledge that the consumption of food involves inherent risks, including but not limited to <mark class="bg-[#E8C547]/30 px-1 rounded text-[#1A1816]">foodborne illness</mark> and <mark class="bg-[#E8C547]/30 px-1 rounded text-[#1A1816]">allergic reactions</mark>. I understand that UnCampus LLC is a procurement agent and does not prepare the food items.
                </p>
              </div>

              <!-- 2.3 Handling and Storage -->
              <div class="space-y-2">
                <h3 class="font-semibold text-[#1A1816] flex items-baseline gap-2">
                  <span class="text-[#E67E50] text-sm font-mono">2.3</span>
                  Handling and Storage
                </h3>
                <p class="text-[#5C5A56] leading-relaxed pl-6">
                  I assume full responsibility for the proper handling, refrigeration, and timely consumption of all meals once they are delivered or made available at the designated pickup location.
                </p>
              </div>

              <!-- 2.4 Negligence -->
              <div class="space-y-2">
                <h3 class="font-semibold text-[#1A1816] flex items-baseline gap-2">
                  <span class="text-[#E67E50] text-sm font-mono">2.4</span>
                  Negligence
                </h3>
                <p class="text-[#5C5A56] leading-relaxed pl-6">
                  This release includes claims arising from the <mark class="bg-[#C85454]/15 px-1 rounded font-medium text-[#1A1816]">ordinary negligence</mark> of the Releasees to the fullest extent permitted under <mark class="bg-[#2D9B9B]/20 px-1 rounded text-[#1A1816]">California law</mark>.
                </p>
              </div>
            </div>
          </article>
        </section>

        <!-- SECTION 3: Privacy Policy -->
        <section id="privacy" class="scroll-mt-20">
          <article class="bg-white rounded-lg border-2 border-[#D9D7D2] overflow-hidden">
            <header class="bg-[#F5F3EF] px-6 py-4 border-b border-[#D9D7D2]">
              <div class="flex items-center gap-3">
                <span class="text-2xl" aria-hidden="true">🔒</span>
                <div>
                  <h2 class="text-xl font-bold text-[#1A1816] tracking-tight">
                    3. Privacy Policy
                  </h2>
                  <p class="text-sm text-[#5C5A56] mt-0.5">
                    How we collect, use, and protect your data
                  </p>
                </div>
              </div>
            </header>

            <div class="p-6 space-y-6">
              <!-- 3.1 Data Collection -->
              <div class="space-y-2">
                <h3 class="font-semibold text-[#1A1816] flex items-baseline gap-2">
                  <span class="text-[#E67E50] text-sm font-mono">3.1</span>
                  Data Collection
                </h3>
                <p class="text-[#5C5A56] leading-relaxed pl-6">
                  We collect your name, contact information, and billing details solely for the purpose of managing your subscription and coordinating deliveries.
                </p>
              </div>

              <!-- 3.2 Data Sharing -->
              <div class="space-y-2">
                <h3 class="font-semibold text-[#1A1816] flex items-baseline gap-2">
                  <span class="text-[#E67E50] text-sm font-mono">3.2</span>
                  Data Sharing
                </h3>
                <p class="text-[#5C5A56] leading-relaxed pl-6">
                  Your name and specific meal preferences may be shared with our third-party food vendors for fulfillment purposes. <mark class="bg-[#52A675]/20 px-1 rounded font-medium text-[#1A1816]">We do not sell or lease your personal information to third parties.</mark>
                </p>
              </div>

              <!-- 3.3 Security -->
              <div class="space-y-2">
                <h3 class="font-semibold text-[#1A1816] flex items-baseline gap-2">
                  <span class="text-[#E67E50] text-sm font-mono">3.3</span>
                  Security
                </h3>
                <p class="text-[#5C5A56] leading-relaxed pl-6">
                  We utilize secure payment processing through <mark class="bg-[#2D9B9B]/20 px-1 rounded text-[#1A1816]">Stripe</mark> to protect your financial and personal data.
                </p>
              </div>
            </div>
          </article>
        </section>

        <!-- SECTION 4: Binding Acceptance -->
        <section id="acceptance" class="scroll-mt-20">
          <article class="bg-[#1A1816] text-white rounded-lg overflow-hidden">
            <div class="p-6 md:p-8">
              <div class="flex items-start gap-4">
                <span class="text-2xl flex-shrink-0" aria-hidden="true">✓</span>
                <div class="space-y-3">
                  <h2 class="text-xl font-bold tracking-tight">
                    4. Binding Acceptance
                  </h2>
                  <p class="text-[#B8B6B1] leading-relaxed">
                    By completing the checkout process and selecting the mandatory agreement box, you acknowledge that you have read, understood, and agreed to be bound by all terms contained in this Agreement.
                  </p>
                </div>
              </div>
            </div>
          </article>
        </section>

        <!-- Document Footer - Questions/Contact -->
        <footer class="text-center py-8 space-y-4">
          <p class="text-[#5C5A56] text-sm">
            Questions about these terms?
          </p>
          <a
            href="https://t.me/noahchonlee"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-2 text-[#E67E50] hover:underline font-medium"
          >
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.161c-.18 1.897-.962 6.502-1.359 8.627-.168.9-.5 1.201-.82 1.23-.697.064-1.226-.461-1.901-.903-1.056-.692-1.653-1.123-2.678-1.799-1.185-.781-.417-1.21.258-1.911.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.139-5.062 3.345-.479.329-.913.489-1.302.481-.428-.008-1.252-.241-1.865-.44-.752-.244-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.831-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635.099-.002.321.023.465.141.121.099.154.232.17.325.015.093.034.306.019.472z"/>
            </svg>
            Contact @noahchonlee on Telegram
          </a>
          <p class="text-[#8E8C87] text-xs mt-6">
            Document version {DOCUMENT_VERSION.version} · Effective {DOCUMENT_VERSION.effectiveDate}
          </p>
        </footer>

      </div>
    </Container>
  </main>

  <!-- Page Footer -->
  <footer class="bg-[#1A1816] py-8">
    <Container>
      <div class="text-center">
        <Text color="inverse" size="sm" align="center" as="p">
          © 2025 Frontier Meals. Serving Frontier Tower weekdays at noon.
        </Text>
        <Text color="tertiary" size="sm" align="center" as="p" class="mt-2">
          <a href="/" class="text-[#E67E50] hover:underline focus:outline-none focus:ring-2 focus:ring-[#E67E50] focus:ring-offset-2 focus:ring-offset-[#1A1816] rounded cursor-pointer">Return to home</a>
        </Text>
      </div>
    </Container>
  </footer>
</div>
