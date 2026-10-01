import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const ScrollToTop = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    // The app shell scrolls inside DashboardLayout's <main data-scroll-container>,
    // not the window, so reset that container's scroll offset on route change.
    document
      .querySelector<HTMLElement>("[data-scroll-container]")
      ?.scrollTo(0, 0);
  }, [pathname]);

  return null;
};

export default ScrollToTop;
