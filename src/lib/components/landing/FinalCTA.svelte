<script lang="ts">
  import { Section, Container, Heading, Text } from '$lib/components/landing';
  import Button from '$lib/components/ui/button.svelte';

  interface Props {
    onSubscribe: () => void;
    onContact: () => void;
    loading?: boolean;
  }

  let { onSubscribe, onContact, loading = false }: Props = $props();
</script>

<Section background="recessed" spacing="spacious">
  <Container size="narrow">
    <div class="text-center">
      <Heading level={2} align="center" class="mb-4">
        Ready to simplify your lunch routine?
      </Heading>

      <Text size="lg" align="center" class="mb-8 max-w-xl mx-auto">
        Join Frontier Meals today and never think about lunch again.
        Healthy meals, great community, zero hassle.
      </Text>

      <div class="flex flex-wrap justify-center gap-4 mb-6">
        <Button
          onclick={onSubscribe}
          disabled={loading}
          size="lg"
          aria-label="Subscribe to Frontier Meals"
        >
          {loading ? 'Loading...' : 'Subscribe Now'}
        </Button>

        <Button
          variant="outline"
          onclick={onContact}
          size="lg"
          aria-label="Contact us on Telegram"
        >
          Contact Us
        </Button>
      </div>

      <Text size="sm" color="tertiary" align="center">
        Available exclusively at Frontier Tower
      </Text>
    </div>
  </Container>
</Section>
