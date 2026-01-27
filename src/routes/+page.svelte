<script lang="ts">
  import {
    HeroSection,
    CommunityGallery,
    HowItWorks,
    FlexibilityFeatures,
    FoodShowcase,
    BenefitsGrid,
    SocialProof,
    FinalCTA,
    Container,
    Text,
  } from '$lib/components/landing';

  let loading = $state(false);
  let error = $state('');

  async function handleSubscribe() {
    loading = true;
    error = '';

    try {
      const response = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        error = 'Failed to create checkout session';
      }
    } catch (err) {
      error = 'An error occurred. Please try again.';
      console.error(err);
    } finally {
      loading = false;
    }
  }

  function handleLearnMore() {
    // Smooth scroll to How It Works section
    document.getElementById('how-it-works')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
  }

  function handleContact() {
    // Open Telegram contact
    window.open('https://t.me/noahchonlee', '_blank');
  }
</script>

<svelte:head>
  <title>Frontier Meals - Healthy Lunch Subscription at Frontier Tower</title>
  <meta name="description" content="Healthy lunches delivered daily to Frontier Tower. Subscribe once, show up at noon, and enjoy community dining or grab and go." />
</svelte:head>

<div class="min-h-screen bg-[#F5F3EF]">
  <!-- Skip Link for Keyboard Navigation -->
  <a
    href="#main-content"
    class="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-[#E67E50] focus:text-white focus:rounded-md focus:font-bold cursor-pointer"
  >
    Skip to main content
  </a>

  <!-- Error Banner (if any) -->
  {#if error}
    <div class="fixed top-0 left-0 right-0 z-50 bg-[#C85454] text-white py-3 px-4 text-center">
      <Container>
        <p class="text-sm font-medium">{error}</p>
      </Container>
    </div>
  {/if}

  <!-- Main Content -->
  <main id="main-content">
    <!-- Hero: Identity + Value Proposition -->
    <HeroSection
      onSubscribe={handleSubscribe}
      onLearnMore={handleLearnMore}
      {loading}
    />

    <!-- Community: Emotional resonance + Social proof -->
    <CommunityGallery />

    <!-- How It Works: Mental model construction -->
    <div id="how-it-works">
      <HowItWorks />
    </div>

    <!-- Flexibility: Risk mitigation + Key differentiator (75% reimbursement) -->
    <FlexibilityFeatures />

    <!-- Food: Sensory appeal + Quality signal -->
    <FoodShowcase />

    <!-- Benefits: Rational justification -->
    <BenefitsGrid />

    <!-- Social Proof: Trust + Belonging -->
    <SocialProof />

    <!-- Final CTA: Decision capture -->
    <FinalCTA
      onSubscribe={handleSubscribe}
      onContact={handleContact}
      {loading}
    />
  </main>

  <!-- Footer -->
  <footer class="bg-[#1A1816] py-8">
    <Container>
      <div class="text-center space-y-2">
        <Text color="inverse" size="sm" align="center" as="p">
          © 2025 Frontier Meals. Serving Frontier Tower weekdays at noon.
        </Text>
        <Text color="tertiary" size="sm" align="center" as="p">
          Questions? Message <a href="https://t.me/noahchonlee" class="text-[#E67E50] hover:underline focus:outline-none focus:ring-2 focus:ring-[#E67E50] focus:ring-offset-2 focus:ring-offset-[#1A1816] rounded cursor-pointer" aria-label="Contact Noah on Telegram" data-sveltekit-preload-data="false">@noahchonlee</a> on Telegram
        </Text>
        <Text color="tertiary" size="sm" align="center" as="p">
          <a href="/terms-and-privacy" class="text-[#8E8C87] hover:text-[#E67E50] hover:underline focus:outline-none focus:ring-2 focus:ring-[#E67E50] focus:ring-offset-2 focus:ring-offset-[#1A1816] rounded cursor-pointer transition-colors duration-150">Terms & Privacy</a>
        </Text>
      </div>
    </Container>
  </footer>
</div>
