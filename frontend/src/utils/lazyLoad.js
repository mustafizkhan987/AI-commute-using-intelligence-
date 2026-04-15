/**
 * Lazy Loading Utilities for ClearPath v2.1
 * Implements on-demand component loading, image optimization, and code splitting
 */

// 1. Code Splitting - Lazy load components
export const lazyLoadComponent = (importFunc) => {
  return React.lazy(() => 
    importFunc().catch(err => {
      console.error('Component load failed:', err);
      return { default: () => <div>Failed to load component</div> };
    })
  );
};

// 2. Intersection Observer for images/content visibility
export const useIntersectionObserver = (ref, threshold = 0.1) => {
  const [isVisible, setIsVisible] = React.useState(false);
  
  React.useEffect(() => {
    if (!ref.current) return;
    
    const observer = new IntersectionObserver(
      ([entry]) => entry.isIntersecting && setIsVisible(true),
      { threshold }
    );
    
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref, threshold]);
  
  return isVisible;
};

// 3. Virtual scrolling for large lists
export const VirtualList = ({ items, renderItem, itemHeight = 60, height = 400 }) => {
  const [scrollTop, setScrollTop] = React.useState(0);
  const containerRef = React.useRef(null);
  
  const visibleStart = Math.floor(scrollTop / itemHeight);
  const visibleCount = Math.ceil(height / itemHeight);
  const visibleItems = items.slice(visibleStart, visibleStart + visibleCount);
  const offsetY = visibleStart * itemHeight;
  
  return (
    <div
      ref={containerRef}
      style={{
        height,
        overflow: 'auto',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '12px'
      }}
      onScroll={(e) => setScrollTop(e.target.scrollTop)}
    >
      <div style={{ height: items.length * itemHeight }}>
        <div style={{ transform: `translateY(${offsetY}px)` }}>
          {visibleItems.map((item, i) => (
            <div key={visibleStart + i} style={{ height: itemHeight }}>
              {renderItem(item, visibleStart + i)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// 4. Image optimization with lazy loading
export const LazyImage = ({ src, alt, placeholder, width, height }) => {
  const [loaded, setLoaded] = React.useState(false);
  const [actual, setActual] = React.useState(null);
  const ref = React.useRef(null);
  const isVisible = useIntersectionObserver(ref);
  
  React.useEffect(() => {
    if (!isVisible) return;
    
    const img = new Image();
    img.src = src;
    img.onload = () => {
      setActual(src);
      setLoaded(true);
    };
  }, [isVisible, src]);
  
  return (
    <div
      ref={ref}
      style={{
        width, height,
        background: loaded ? 'transparent' : `url(${placeholder})`,
        backgroundSize: 'cover',
        borderRadius: '12px',
        overflow: 'hidden'
      }}
    >
      {actual && (
        <img 
          src={actual} 
          alt={alt}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            animation: 'fadeIn 0.3s ease-in'
          }}
        />
      )}
    </div>
  );
};

// 5. Progressive Data Loading
export const useProgressiveData = (fetchFn, dependencies = []) => {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const abortRef = React.useRef(null);
  
  React.useEffect(() => {
    setLoading(true);
    abortRef.current = new AbortController();
    
    fetchFn(abortRef.current.signal)
      .then(setData)
      .catch(err => !err.name.includes('Abort') && setError(err))
      .finally(() => setLoading(false));
    
    return () => abortRef.current?.abort();
  }, dependencies);
  
  return { data, loading, error };
};

// 6. Debounced search for large datasets
export const useDebounce = (value, delay = 300) => {
  const [debouncedValue, setDebouncedValue] = React.useState(value);
  
  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  
  return debouncedValue;
};

// 7. Request watermarking for ordering
export const createWatermarkedRequest = (url, params = {}) => {
  const timestamp = Date.now();
  return {
    url: `${url}?t=${timestamp}`,
    params,
    timestamp
  };
};
