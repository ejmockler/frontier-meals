<script lang="ts">
  import { Section, Container, Heading, Text } from '$lib/components/landing';
  import { scrollReveal } from '$lib/actions/scrollReveal';

  const features = [
    {
      title: 'Variety Every Day',
      description: 'Different menu options to keep things interesting',
      icon: '🍽️',
    },
    {
      title: 'Dietary Accommodations',
      description: 'Options for various dietary preferences and needs',
      icon: '❤️',
    },
    {
      title: 'Generous Portions',
      description: 'Satisfying meals that keep you energized all afternoon',
      icon: '📦',
    },
  ];

  const images = [
    {
      src: '/images/landing/buffet-spread.jpg',
      alt: 'Fresh buffet spread',
    },
    {
      src: '/images/landing/serving-meals.jpg',
      alt: 'Serving delicious meals',
    },
  ];
</script>

<Section background="elevated">
  <Container>
    <div class="grid lg:grid-cols-2 gap-12 lg:gap-16 items-start">
      <!-- Content Side -->
      <div>
        <Heading level={2} class="mb-4">
          Fresh, Healthy, Delicious
        </Heading>

        <Text size="lg" class="mb-8 max-w-lg">
          Every meal is carefully prepared with fresh ingredients and balanced nutrition
          in mind. From hearty mains to fresh salads and sides, there's something for everyone.
        </Text>

        <!-- Feature Cards -->
        <div class="space-y-4">
          {#each features as feature, i}
            <div
              class="flex items-start gap-4 p-4 bg-[#F5F3EF] rounded-md border-2 border-[#D9D7D2]"
              use:scrollReveal={{ delay: i * 50 }}
            >
              <div class="w-12 h-12 rounded-md bg-[#E8E6E1] flex items-center justify-center flex-shrink-0">
                <span class="text-2xl">{feature.icon}</span>
              </div>
              <div>
                <Heading level={4}>
                  {feature.title}
                </Heading>
                <Text size="sm" color="secondary" class="mt-1">
                  {feature.description}
                </Text>
              </div>
            </div>
          {/each}
        </div>
      </div>

      <!-- Images Side -->
      <div class="grid grid-cols-2 gap-4">
        {#each images as image, i}
          <div
            class="rounded-md overflow-hidden shadow-lg"
            class:col-span-2={i === 0}
            class:aspect-video={i === 0}
            class:aspect-square={i !== 0}
          >
            <img
              src={image.src}
              alt={image.alt}
              class="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
              loading="lazy"
              decoding="async"
            />
          </div>
        {/each}
      </div>
    </div>
  </Container>
</Section>
