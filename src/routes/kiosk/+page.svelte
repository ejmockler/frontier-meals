<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { PageData } from './$types';
  import jsQR from 'jsqr';

  let { data }: { data: PageData } = $props();

  let videoElement: HTMLVideoElement;
  let canvasElement: HTMLCanvasElement;
  let overlayCanvas: HTMLCanvasElement;
  let stream: MediaStream | null = null;
  let scanning = false;
  let viewState = $state<'idle' | 'scanning' | 'success' | 'error'>('idle');
  let message = $state('');
  let customerName = $state('');
  let dietary_flags = $state<any>({});
  let errorCode = $state('');

  // QR detection state - organic, living feedback
  let qrDetected = $state(false);
  let qrLocation: any = null;
  let qrProcessing = false;
  let particles: Array<{x: number, y: number, vx: number, vy: number, life: number}> = [];

  // Get current time for display
  let currentTime = $state(new Date());
  let timeInterval: ReturnType<typeof setInterval>;

  $effect(() => {
    timeInterval = setInterval(() => {
      currentTime = new Date();
    }, 1000);

    return () => clearInterval(timeInterval);
  });

  onDestroy(() => {
    stopCamera();
  });

  async function handleScanButtonClick() {
    playButtonClick();
    viewState = 'scanning';
    await startCamera();
  }

  async function startCamera() {
    try {
      qrProcessing = false;
      particles = [];

      console.log('[Kiosk] Requesting camera access...');
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });

      console.log('[Kiosk] Camera stream obtained');

      if (videoElement) {
        videoElement.srcObject = stream;
        await videoElement.play();
        scanning = true;
        console.log('[Kiosk] Camera started');
        requestAnimationFrame(tick);
      }
    } catch (error) {
      console.error('[Kiosk] Camera error:', error);
      viewState = 'error';
      message = 'Unable to access camera. Please check permissions.';
      setTimeout(() => resetToIdle(), 3000);
    }
  }

  function stopCamera() {
    scanning = false;
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      stream = null;
    }
  }

  function tick() {
    if (!scanning || !videoElement || !canvasElement || !overlayCanvas) return;

    const canvas = canvasElement.getContext('2d');
    const overlay = overlayCanvas.getContext('2d');
    if (!canvas || !overlay) return;

    if (videoElement.readyState === videoElement.HAVE_ENOUGH_DATA) {
      // Process frame for QR detection
      canvasElement.height = videoElement.videoHeight;
      canvasElement.width = videoElement.videoWidth;
      canvas.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);

      const imageData = canvas.getImageData(0, 0, canvasElement.width, canvasElement.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height);

      // Match overlay canvas to video element display size
      const rect = videoElement.getBoundingClientRect();
      overlayCanvas.width = rect.width;
      overlayCanvas.height = rect.height;

      // Scale factor from video to display
      const scaleX = rect.width / canvasElement.width;
      const scaleY = rect.height / canvasElement.height;

      overlay.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

      if (code && code.location) {
        // QR detected - visualize corners organically
        qrDetected = true;
        qrLocation = code.location;

        // Draw organic corner detection
        drawQRCorners(overlay, code.location, scaleX, scaleY);

        // Spawn particles at corners
        spawnParticles(code.location, scaleX, scaleY);

        // After brief lock-on, process code (only once)
        if (!qrProcessing) {
          qrProcessing = true;
          setTimeout(() => {
            if (scanning) {
              playScanSound();
              handleQRCode(code.data);
            }
          }, 300);
        }
      } else {
        qrDetected = false;
        qrLocation = null;
      }

      // Update and draw particles
      updateParticles(overlay);
    }

    requestAnimationFrame(tick);
  }

  // Draw organic, living corner markers
  function drawQRCorners(ctx: CanvasRenderingContext2D, loc: any, sx: number, sy: number) {
    const corners = [
      { x: loc.topLeftCorner.x * sx, y: loc.topLeftCorner.y * sy },
      { x: loc.topRightCorner.x * sx, y: loc.topRightCorner.y * sy },
      { x: loc.bottomRightCorner.x * sx, y: loc.bottomRightCorner.y * sy },
      { x: loc.bottomLeftCorner.x * sx, y: loc.bottomLeftCorner.y * sy }
    ];

    // Pulsing glow effect
    const pulse = Math.sin(Date.now() / 200) * 0.3 + 0.7;

    // Draw connecting lines - organic, not rigid
    ctx.strokeStyle = `rgba(230, 126, 80, ${pulse})`;
    ctx.lineWidth = 3;
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#E67E50';

    ctx.beginPath();
    corners.forEach((corner, i) => {
      if (i === 0) ctx.moveTo(corner.x, corner.y);
      else ctx.lineTo(corner.x, corner.y);
    });
    ctx.closePath();
    ctx.stroke();

    // Draw corner nucleotides - small molecules
    corners.forEach((corner, i) => {
      const offset = Math.sin(Date.now() / 150 + i) * 3;

      // Outer ring
      ctx.beginPath();
      ctx.arc(corner.x, corner.y, 12 + offset, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(232, 197, 71, ${pulse * 0.8})`;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Inner core
      ctx.beginPath();
      ctx.arc(corner.x, corner.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(230, 126, 80, ${pulse})`;
      ctx.fill();

      // Dancing molecules around corner
      for (let j = 0; j < 3; j++) {
        const angle = (Date.now() / 400 + i * Math.PI / 2 + j * Math.PI * 2 / 3);
        const radius = 18 + Math.sin(Date.now() / 200 + j) * 4;
        const mx = corner.x + Math.cos(angle) * radius;
        const my = corner.y + Math.sin(angle) * radius;

        ctx.beginPath();
        ctx.arc(mx, my, 2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(232, 197, 71, ${pulse * 0.6})`;
        ctx.fill();
      }
    });

    ctx.shadowBlur = 0;
  }

  // Spawn particle proteins
  function spawnParticles(loc: any, sx: number, sy: number) {
    const corners = [
      { x: loc.topLeftCorner.x * sx, y: loc.topLeftCorner.y * sy },
      { x: loc.topRightCorner.x * sx, y: loc.topRightCorner.y * sy },
      { x: loc.bottomRightCorner.x * sx, y: loc.bottomRightCorner.y * sy },
      { x: loc.bottomLeftCorner.x * sx, y: loc.bottomLeftCorner.y * sy }
    ];

    // Only spawn if particle count is low
    if (particles.length < 40) {
      corners.forEach(corner => {
        if (Math.random() < 0.3) {
          particles.push({
            x: corner.x,
            y: corner.y,
            vx: (Math.random() - 0.5) * 2,
            vy: (Math.random() - 0.5) * 2,
            life: 1
          });
        }
      });
    }
  }

  // Update particle proteins - information-dense molecules
  function updateParticles(ctx: CanvasRenderingContext2D) {
    particles = particles.filter(p => p.life > 0);

    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.02;

      // Draw particle
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(232, 197, 71, ${p.life * 0.5})`;
      ctx.fill();
    });
  }

  async function handleQRCode(qrToken: string) {
    scanning = false;
    viewState = 'scanning';
    message = 'Validating...';

    try {
      const response = await fetch('/api/kiosk/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qrToken,
          kioskSessionToken: data.kiosk.sessionToken
        })
      });

      const result = await response.json();

      if (response.ok && result.success) {
        viewState = 'success';
        customerName = result.customer.name;
        dietary_flags = result.customer.dietary_flags || {};
        message = 'Meal redeemed successfully!';
        playSuccessSound();

        setTimeout(() => resetToIdle(), 5000);
      } else {
        viewState = 'error';
        errorCode = result.code || 'UNKNOWN';
        message = result.error || 'Invalid QR code';
        playErrorSound();

        setTimeout(() => resetToIdle(), 3000);
      }
    } catch (error) {
      viewState = 'error';
      message = 'Network error. Please try again.';
      playErrorSound();
      setTimeout(() => resetToIdle(), 3000);
    }
  }

  function resetToIdle() {
    stopCamera();
    viewState = 'idle';
    message = '';
    customerName = '';
    dietary_flags = {};
    errorCode = '';
    qrProcessing = false;
    particles = [];
  }

  function formatTime(date: Date): string {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  function formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', { weekday: 'long' });
  }

  // Sound Effects using Web Audio API
  function playSound(frequency: number, duration: number, type: OscillatorType = 'sine') {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = frequency;
      oscillator.type = type;

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + duration);
    } catch (error) {
      console.log('Audio not available');
    }
  }

  function playButtonClick() {
    playSound(600, 0.1, 'sine');
  }

  function playSuccessSound() {
    // Pleasant success chime (C major arpeggio)
    setTimeout(() => playSound(523.25, 0.15, 'sine'), 0);    // C5
    setTimeout(() => playSound(659.25, 0.15, 'sine'), 100);  // E5
    setTimeout(() => playSound(783.99, 0.3, 'sine'), 200);   // G5
  }

  function playErrorSound() {
    // Gentle error tone (not harsh)
    playSound(300, 0.2, 'sine');
    setTimeout(() => playSound(250, 0.3, 'sine'), 150);
  }

  function playScanSound() {
    playSound(800, 0.05, 'sine');
  }
</script>

<svelte:head>
  <title>Kiosk - Frontier Meals</title>
</svelte:head>

<div class="min-h-screen bg-[#F5F3EF] frontier-texture relative">
  <!-- Video and canvas always mounted for camera access -->
  <video
    bind:this={videoElement}
    class:hidden={viewState !== 'scanning'}
    class="absolute inset-0 w-full h-full object-cover z-0"
    autoplay
    muted
    playsinline
  ></video>

  <!-- Overlay canvas for organic QR corner detection -->
  <canvas
    bind:this={overlayCanvas}
    class:hidden={viewState !== 'scanning'}
    class="absolute inset-0 w-full h-full pointer-events-none z-5"
  ></canvas>

  <canvas bind:this={canvasElement} class="hidden"></canvas>

  {#if viewState === 'idle'}
    <!-- HERO/IDLE STATE - Raw, industrial, bold -->
    <div class="h-screen flex flex-col items-center justify-center px-8 relative z-10">
      <!-- Large meal icon - less floaty, more grounded -->
      <div class="text-9xl mb-6">
        🍽️
      </div>

      <!-- Main greeting - industrial typography -->
      <h1 class="text-6xl md:text-8xl font-extrabold text-[#1A1816] mb-2 text-center tracking-tight">
        Ready for your meal?
      </h1>

      <!-- Subtext - raw, direct -->
      <p class="text-2xl text-[#5C5A56] mb-16 font-medium">
        Scan to pick up
      </p>

      <!-- CTA Button - bold, minimal rounding, orange -->
      <button
        onclick={handleScanButtonClick}
        class="px-20 py-6 bg-[#E67E50] hover:bg-[#D97F3E] text-white text-3xl font-bold rounded-md shadow-lg hover:shadow-xl transform hover:scale-[1.02] transition-all duration-150 active:scale-[0.98] border-2 border-[#D97F3E]"
      >
        Scan QR Code
      </button>

      <!-- Time display - industrial, high contrast -->
      <div class="mt-20 text-center">
        <div class="text-4xl font-bold text-[#1A1816] tabular-nums">
          {formatTime(currentTime)}
        </div>
        <div class="text-lg text-[#8E8C87] font-medium mt-1 uppercase tracking-wider">
          {formatDate(currentTime)}
        </div>
      </div>
    </div>
  {:else if viewState === 'scanning'}
    <!-- SCANNING STATE - Industrial, bold orange -->
    <div class="relative h-screen flex items-center justify-center">
      <!-- Scanning frame overlay - raw, minimal -->
      <div class="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
        <div class="w-80 h-80 border-4 border-[#E67E50] rounded-sm relative shadow-xl bg-[#1A1816]/5">
          <!-- Corner accents - hard angles, industrial -->
          <div class="absolute -top-1 -left-1 w-16 h-16 border-t-[6px] border-l-[6px] border-[#E8C547]"></div>
          <div class="absolute -top-1 -right-1 w-16 h-16 border-t-[6px] border-r-[6px] border-[#E8C547]"></div>
          <div class="absolute -bottom-1 -left-1 w-16 h-16 border-b-[6px] border-l-[6px] border-[#E8C547]"></div>
          <div class="absolute -bottom-1 -right-1 w-16 h-16 border-b-[6px] border-r-[6px] border-[#E8C547]"></div>

          <!-- Scanning line - bold orange -->
          <div class="absolute inset-0 flex items-center justify-center overflow-hidden">
            <div class="w-full h-1 bg-[#E67E50] animate-scan shadow-lg"></div>
          </div>
        </div>
      </div>

      <!-- Instructions - industrial card -->
      <div class="absolute bottom-20 left-0 right-0 text-center z-10">
        <div class="inline-block bg-[#E8E6E1]/95 backdrop-blur-sm px-12 py-6 rounded-sm shadow-xl border-2 border-[#D9D7D2]">
          <p class="text-3xl font-bold text-[#1A1816] mb-2">Hold QR code steady</p>
          <button
            onclick={resetToIdle}
            class="mt-4 text-[#E67E50] hover:text-[#D97F3E] font-bold text-lg uppercase tracking-wide"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  {:else if viewState === 'success'}
    <!-- SUCCESS STATE - Muted, warm, industrial -->
    <div class="h-screen flex items-center justify-center bg-[#F5F3EF] relative z-10">
      <div class="text-center max-w-3xl px-8">
        <!-- Success icon - muted green, less polished -->
        <div class="inline-flex items-center justify-center w-40 h-40 bg-[#52A675] rounded-sm mb-8 shadow-xl border-4 border-[#52A675]/30">
          <svg class="w-24 h-24 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="square" stroke-linejoin="miter" stroke-width="4" d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <!-- Greeting - bold, industrial -->
        <h1 class="text-7xl font-extrabold text-[#1A1816] mb-4 tracking-tight">
          Welcome, {customerName}!
        </h1>

        <p class="text-4xl text-[#52A675] font-bold mb-12">
          Enjoy your meal 🍽️
        </p>

        {#if Object.keys(dietary_flags).length > 0}
          <div class="bg-[#E8E6E1] rounded-sm p-8 border-2 border-[#D9D7D2] shadow-lg">
            <p class="text-2xl font-extrabold text-[#1A1816] mb-6 uppercase tracking-wide">Dietary Preferences</p>
            <div class="flex flex-wrap gap-3 justify-center">
              {#each Object.entries(dietary_flags) as [key, value]}
                {#if value}
                  <span class="px-5 py-2 bg-[#52A675] text-white rounded-sm text-lg font-bold border-2 border-[#52A675]/50 uppercase tracking-wide">
                    {key.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </span>
                {/if}
              {/each}
            </div>
          </div>
        {/if}
      </div>
    </div>
  {:else if viewState === 'error'}
    <!-- ERROR STATE - Warm error, not harsh -->
    <div class="h-screen flex items-center justify-center bg-[#F5F3EF] relative z-10">
      <div class="text-center max-w-3xl px-8">
        <!-- Error icon - muted red, industrial -->
        <div class="inline-flex items-center justify-center w-40 h-40 bg-[#D97F3E] rounded-sm mb-8 shadow-xl border-4 border-[#D97F3E]/30">
          <svg class="w-24 h-24 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="square" stroke-linejoin="miter" stroke-width="4" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>

        <!-- Error message - bold, direct -->
        <h1 class="text-6xl font-extrabold text-[#1A1816] mb-4 tracking-tight">
          {#if errorCode === 'ALREADY_USED'}
            Already Scanned
          {:else if errorCode === 'EXPIRED'}
            Code Expired
          {:else if errorCode === 'ALREADY_REDEEMED'}
            Already Redeemed
          {:else}
            Something's not right
          {/if}
        </h1>

        <p class="text-3xl text-[#D97F3E] font-bold mb-8">{message}</p>

        <div class="bg-[#E8E6E1] rounded-sm p-8 border-2 border-[#D9D7D2] shadow-lg">
          <p class="text-2xl text-[#5C5A56] font-medium">
            {#if errorCode === 'ALREADY_REDEEMED'}
              You've already picked up your meal today. Enjoy! 🍽️
            {:else}
              Check your QR code or contact support
            {/if}
          </p>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  /* Industrial, mechanical animations - less playful */
  @keyframes scan {
    0%, 100% { transform: translateY(-100%); }
    50% { transform: translateY(100%); }
  }

  .animate-scan {
    animation: scan 2s linear infinite;
  }
</style>
