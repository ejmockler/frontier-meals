<script lang="ts">
  import { Section, Container, Heading, Text } from '$lib/components/landing';
  import SubscriptionCheckout from './SubscriptionCheckout.svelte';
  import Button from '$lib/components/ui/button.svelte';

  interface Props {
    onCheckout: (reservationId?: string, email?: string) => void;
    onContact: () => void;
    loading?: boolean;
    price?: string;
  }

  let { onCheckout, onContact, loading = false, price = '$500/month' }: Props = $props();
</script>

<Section background="recessed" spacing="compact">
  <Container size="narrow">
    <div class="text-center mb-8">
      <Heading level={2} align="center" class="mb-4">
        Ready to simplify your lunch routine?
      </Heading>

      <Text size="lg" align="center" class="max-w-xl mx-auto">
        Join Frontier Meals today and never think about lunch again.
        Healthy meals, great community, zero hassle.
      </Text>
    </div>

    <!-- Checkout Component with Commitment Threshold -->
    <div id="checkout">
      <SubscriptionCheckout
        onPayPalCheckout={onCheckout}
        {loading}
        {price}
      />
    </div>

    <div class="text-center mt-8">
      <Text size="sm" color="tertiary" align="center" class="mb-4">
        Questions before subscribing?
      </Text>

      <Button
        variant="outline"
        onclick={onContact}
        size="default"
        aria-label="Contact us on Telegram"
      >
        Contact Us
      </Button>

      <Text size="sm" color="tertiary" align="center" class="mt-6">
        Available exclusively at Frontier Tower
      </Text>
    </div>
  </Container>
</Section>
