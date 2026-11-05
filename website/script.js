// Pause the walkthrough when it leaves the page so it never plays out of sight.
const walkthrough = document.querySelector('video');
if (walkthrough && 'IntersectionObserver' in window) {
  const observer = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting && !walkthrough.paused) walkthrough.pause();
  }, { threshold: 0.05 });
  observer.observe(walkthrough);
}
