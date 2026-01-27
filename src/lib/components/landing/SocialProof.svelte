<script lang="ts">
  import { Section, Container, Heading } from '$lib/components/landing';
</script>

<Section background="recessed" spacing="normal">
  <Container>
    <div class="text-center mb-8">
      <Heading level={2} align="center">
        Loved by the Frontier Tower Community
      </Heading>
    </div>

    <!-- Large Community Image -->
    <div class="relative rounded-md overflow-hidden shadow-xl max-w-4xl mx-auto">
      <img
        src="/images/landing/large-gathering.jpg"
        alt="Large community gathering at Frontier Tower lunch"
        width="1200"
        height="800"
        class="w-full"
        loading="lazy"
        decoding="async"
      />

      <!-- Gradient overlay for depth -->
      <div class="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent"></div>
    </div>
  </Container>
</Section>
