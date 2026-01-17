// src/lib/actions/scrollReveal.ts

type ScrollRevealOptions = {
	threshold?: number;
	rootMargin?: string;
	once?: boolean;
	delay?: number;
};

export function scrollReveal(node: HTMLElement, options: ScrollRevealOptions = {}) {
	const { threshold = 0.1, rootMargin = '0px 0px -50px 0px', once = true, delay = 0 } = options;

	// Check for reduced motion preference
	const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	if (prefersReducedMotion) {
		// Skip animations for users who prefer reduced motion
		node.style.opacity = '1';
		node.style.transform = 'none';
		return {};
	}

	// Set initial state
	node.style.opacity = '0';
	node.style.transform = 'translateY(20px)';
	node.style.transition = `opacity 300ms ease-out ${delay}ms, transform 300ms ease-out ${delay}ms`;

	const observer = new IntersectionObserver(
		(entries) => {
			entries.forEach((entry) => {
				if (entry.isIntersecting) {
					// Animate in
					node.style.opacity = '1';
					node.style.transform = 'translateY(0)';

					if (once) {
						observer.unobserve(node);
					}
				} else if (!once) {
					// Reset for re-animation
					node.style.opacity = '0';
					node.style.transform = 'translateY(20px)';
				}
			});
		},
		{ threshold, rootMargin }
	);

	observer.observe(node);

	return {
		destroy() {
			observer.disconnect();
		},
		update(newOptions: ScrollRevealOptions) {
			// Handle option updates if needed
		}
	};
}

// Stagger helper for child elements
export function staggerChildren(
	node: HTMLElement,
	options: { baseDelay?: number; staggerDelay?: number } = {}
) {
	const { baseDelay = 0, staggerDelay = 50 } = options;

	const children = Array.from(node.children) as HTMLElement[];

	children.forEach((child, index) => {
		const delay = baseDelay + index * staggerDelay;
		scrollReveal(child, { delay, once: true });
	});

	return {};
}
