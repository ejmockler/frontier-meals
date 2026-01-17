<script lang="ts">
  import { Section, Container, SectionHeader, Heading, Text } from '$lib/components/landing';
  import { scrollReveal } from '$lib/actions/scrollReveal';

  const benefits = [
    {
      title: 'Healthy & Fresh',
      description: 'Nutritious meals prepared daily with quality ingredients',
      icon: '✨',
    },
    {
      title: 'Save Time',
      description: 'No more lunch planning or waiting in lines',
      icon: '⏰',
    },
    {
      title: 'Build Community',
      description: 'Connect with colleagues over shared meals',
      icon: '👥',
    },
    {
      title: 'Flexible Options',
      description: 'Dine in with the community or grab and go',
      icon: '↔️',
    },
    {
      title: 'Weekday Service',
      description: 'Available every weekday, excluding holidays',
      icon: '📅',
    },
    {
      title: 'Simple Pickup',
      description: 'Just scan your QR code and you\'re all set',
      icon: '📲',
    },
  ];
</script>

<Section>
  <Container>
    <SectionHeader
      headline="Why Frontier Meals?"
    />

    <!-- 6-item Grid: 3x2 on desktop, 2x3 on tablet, 1x6 on mobile -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {#each benefits as benefit, i}
        <div
          class="group p-6 bg-white rounded-md border-2 border-[#D9D7D2] hover:border-[#E67E50] hover:shadow-lg transition-all duration-150"
          use:scrollReveal={{ delay: i * 50 }}
        >
          <!-- Icon -->
          <div class="w-12 h-12 rounded-md bg-[#E8E6E1] group-hover:bg-[#E67E50]/10 flex items-center justify-center mb-4 transition-colors duration-150">
            <span class="text-2xl">{benefit.icon}</span>
          </div>

          <Heading level={4} class="mb-2">
            {benefit.title}
          </Heading>

          <Text size="sm" color="secondary">
            {benefit.description}
          </Text>
        </div>
      {/each}
    </div>
  </Container>
</Section>
