// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

"use client";

import { useEffect, useState } from "react";

export default function Hero() {
  const [phase, setPhase] = useState(0);
  const [typedText, setTypedText] = useState("t");
  const [scrollY, setScrollY] = useState(0);
  const [iphoneVisible, setIphoneVisible] = useState(false);
  const [windowHeight, setWindowHeight] = useState(800);
  const fullText = "tiflis code";

  useEffect(() => {
    // Phase 0: initial pause
    // Phase 1: brackets expand
    // Phase 2: text types
    // Phase 3: complete

    const timer1 = setTimeout(() => setPhase(1), 800);
    const timer2 = setTimeout(() => setPhase(2), 2200);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, []);

  useEffect(() => {
    if (phase !== 2) return;

    let currentIndex = 1;
    const typeInterval = setInterval(() => {
      if (currentIndex <= fullText.length) {
        setTypedText(fullText.slice(0, currentIndex));
        currentIndex++;
      } else {
        clearInterval(typeInterval);
        setPhase(3);
      }
    }, 120);

    return () => clearInterval(typeInterval);
  }, [phase]);

  // Trigger iPhone appearance when phase 3 is reached
  useEffect(() => {
    if (phase >= 3) {
      setIphoneVisible(true);
    }
  }, [phase]);

  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };
    const handleResize = () => {
      setWindowHeight(window.innerHeight);
    };
    handleResize();
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  // Calculate transforms based on scroll
  const maxScroll = 500;
  const scrollProgress = Math.min(scrollY / maxScroll, 1);

  // Hero section moves up faster (parallax effect)
  const heroTranslateY = -scrollY * 0.5; // moves up at 1.5x scroll speed
  const heroOpacity = Math.max(1 - scrollProgress * 1.5, 0); // fades out

  // 3D perspective effect for iPhone - starts tilted back, becomes flat
  // Use easeOutCubic for faster animation at the end
  const easeOutCubic = 1 - Math.pow(1 - scrollProgress, 3);
  const iphoneRotateX = 45 - easeOutCubic * 45; // 45deg -> 0deg
  // On larger screens, start iPhone lower to prevent overlapping hero
  const iphoneStartY = windowHeight > 1000 ? 150 : 50;
  const iphoneTranslateY = iphoneStartY - easeOutCubic * 150;
  const iphoneScale = 0.9 + easeOutCubic * 0.1; // 0.9 -> 1.0

  return (
    <>
      {/* Hero Section - 70vh height but content centered as if 100vh */}
      <section
        className="relative flex flex-col items-center p-8 z-10 overflow-hidden"
        style={{
          height: "70vh",
          transform: `translateY(${heroTranslateY}px)`,
          opacity: heroOpacity,
          transition: "transform 0.05s linear, opacity 0.05s linear",
        }}
      >
        <div className="max-w-4xl text-center" style={{ marginTop: "calc(50vh - 120px)" }}>
          {/* Animated Logo */}
          <div className="flex items-center justify-center mb-8 font-mono text-6xl md:text-7xl select-none">
            {/* Left bracket */}
            <svg
              viewBox="0 0 24 64"
              className="h-20 md:h-24 transition-transform duration-1200 ease-out"
              style={{
                transform: phase >= 1 ? "translateX(0)" : "translateX(80px)",
              }}
            >
              <path
                d="M 18 8 L 8 16 L 8 48 L 18 56"
                fill="none"
                stroke="#2E5AA6"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>

            {/* Prompt arrow */}
            <span
              className="text-4xl md:text-5xl mx-1 transition-opacity duration-300"
              style={{
                background: "linear-gradient(135deg, #2E5AA6, #6F4ABF)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                opacity: phase >= 1 ? 1 : 0,
              }}
            >
              ›
            </span>

            {/* Typed text */}
            <span
              className="text-black dark:text-white font-medium tracking-tight transition-opacity duration-300 whitespace-pre"
              style={{
                fontFamily:
                  "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
                opacity: phase >= 2 ? 1 : 0,
                minWidth: phase >= 2 ? "auto" : "0",
              }}
            >
              {typedText}
              {phase === 2 && (
                <span className="animate-pulse text-purple-500">|</span>
              )}
            </span>

            {/* Right bracket */}
            <svg
              viewBox="0 0 24 64"
              className="h-20 md:h-24 transition-transform duration-1200 ease-out"
              style={{
                transform: phase >= 1 ? "translateX(0)" : "translateX(-80px)",
              }}
            >
              <path
                d="M 6 8 L 16 16 L 16 48 L 6 56"
                fill="none"
                stroke="#6F4ABF"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
          </div>

          <p
            className="text-xl text-gray-600 dark:text-gray-400 transition-opacity duration-500"
            style={{ opacity: phase >= 3 ? 1 : 0 }}
          >
            Voice-controlled AI agents on your workstation from anywhere
          </p>
          <a
            href="/docs/install"
            className="inline-block mt-4 text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors duration-300"
            style={{ opacity: phase >= 3 ? 1 : 0 }}
          >
            Installation Guide →
          </a>
        </div>
      </section>

      {/* iPhone Section */}
      <section className="relative flex flex-col items-center justify-start min-h-screen z-20 pb-4">
        {/* iPhone Mockup with 3D perspective */}
        <div
          style={{
            perspective: "1000px",
            perspectiveOrigin: "center center",
          }}
        >
          <div
            className="relative"
            style={{
              width: "280px",
              opacity: iphoneVisible ? 1 : 0,
              transform: iphoneVisible
                ? `rotateX(${iphoneRotateX}deg) translateY(${iphoneTranslateY}px) scale(${iphoneScale})`
                : `rotateX(55deg) translateY(100vh) scale(0.85)`,
              transformStyle: "preserve-3d",
              transition: iphoneVisible
                ? "opacity 0.3s ease-out, transform 2s cubic-bezier(0.22, 1, 0.36, 1)"
                : "none",
              willChange: "transform, opacity",
            }}
          >
            {/* iPhone Frame */}
            <div className="relative rounded-[3rem] bg-gray-900 p-3 shadow-2xl">
              {/* Dynamic Island */}
              <div className="absolute top-4 left-1/2 -translate-x-1/2 w-24 h-7 bg-black rounded-full z-10" />
              <div className="rounded-[2.5rem] overflow-hidden bg-black">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/screenshots/1-navigation.jpg"
                  alt="Tiflis Code iOS App"
                  className="w-full h-auto"
                />
              </div>
            </div>
            {/* Reflection/Glow */}
            <div
              className="absolute -inset-4 rounded-[4rem] opacity-30 blur-2xl -z-10"
              style={{
                background: "linear-gradient(135deg, #2E5AA6, #6F4ABF)",
              }}
            />
          </div>
        </div>

        {/* App Store Buttons - Official badges */}
        <div
          className="mt-16 lg:mt-32 flex flex-wrap gap-4 justify-center items-center px-4"
          style={{
            opacity: Math.min(scrollProgress * 2, 1),
            transform: `translateY(${20 - scrollProgress * 20}px)`,
            transition: "opacity 0.1s ease-out, transform 0.1s ease-out",
          }}
        >
          <a href="#" className="hover:opacity-80 transition-opacity">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://developer.apple.com/assets/elements/badges/download-on-the-app-store.svg"
              alt="Download on the App Store"
              className="h-11"
            />
          </a>

          <a href="#" className="hover:opacity-80 transition-opacity">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png"
              alt="Get it on Google Play"
              className="h-16 -my-2"
            />
          </a>
        </div>

        {/* Description text below iPhone */}
        <div
          className="mt-12 max-w-xl text-center px-8"
          style={{
            opacity: Math.min(scrollProgress * 2, 1),
            transform: `translateY(${20 - scrollProgress * 20}px)`,
            transition: "opacity 0.1s ease-out, transform 0.1s ease-out",
          }}
        >
          <p className="text-xl text-gray-600 dark:text-gray-400 mb-5">
            Voice control for AI coding agents
          </p>
          <p className="text-base text-gray-500 dark:text-gray-400 mb-5 max-w-lg">
            Dictate commands, review code, and manage development tasks with natural language.
            Perfect for coding on the go, pair programming, or when keyboard access isn&apos;t convenient.
          </p>
          <div className="flex flex-wrap justify-center gap-3 mb-5">
            <span className="inline-flex items-center gap-2 px-5 py-2 text-base font-medium rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
              {/* Claude Code Icon */}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="dark:opacity-90">
                <path d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z" fill="#D97757" fill-rule="nonzero"/>
              </svg>
              Claude Code
            </span>
            <span className="inline-flex items-center gap-2 px-5 py-2 text-base font-medium rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
              {/* Cursor Icon */}
              <svg width="20" height="20" viewBox="0 0 466.73 533.32" fill="none" xmlns="http://www.w3.org/2000/svg" className="dark:opacity-90">
                <path fill="#72716d" className="dark:fill-gray-400" d="M233.37,266.66l231.16,133.46c-1.42,2.46-3.48,4.56-6.03,6.03l-216.06,124.74c-5.61,3.24-12.53,3.24-18.14,0L8.24,406.15c-2.55-1.47-4.61-3.57-6.03-6.03l231.16-133.46h0Z"/>
                <path fill="#55544f" className="dark:fill-gray-500" d="M233.37,0v266.66L2.21,400.12c-1.42-2.46-2.21-5.3-2.21-8.24v-250.44c0-5.89,3.14-11.32,8.24-14.27L224.29,2.43c2.81-1.62,5.94-2.43,9.07-2.43h.01Z"/>
                <path fill="#43413c" className="dark:fill-gray-600" d="M464.52,133.2c-1.42-2.46-3.48-4.56-6.03-6.03L242.43,2.43c-2.8-1.62-5.93-2.43-9.06-2.43v266.66l231.16,133.46c1.42-2.46,2.21-5.3,2.21-8.24v-250.44c0-2.95-.78-5.77-2.21-8.24h-.01Z"/>
                <path fill="#d6d5d2" className="dark:fill-gray-300" d="M448.35,142.54c1.31,2.26,1.49,5.16,0,7.74l-209.83,363.42c-1.41,2.46-5.16,1.45-5.16-1.38v-239.48c0-1.91-.51-3.75-1.44-5.36l216.42-124.95h.01Z"/>
                <path fill="#fff" d="M448.35,142.54l-216.42,124.95c-.92-1.6-2.26-2.96-3.92-3.92L20.62,143.83c-2.46-1.41-1.45-5.16,1.38-5.16h419.65c2.98,0,5.4,1.61,6.7,3.87Z"/>
              </svg>
              Cursor
            </span>
            <span className="inline-flex items-center gap-2 px-5 py-2 text-base font-medium rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
              {/* OpenCode Icon - Theme Aware */}
              <svg width="16" height="20" viewBox="0 0 240 300" fill="none" xmlns="http://www.w3.org/2000/svg" className="dark:invert-[0.85]">
                <g clipPath='url(#clip0_opencode)'>
                  <mask id='mask0_opencode' style={{ maskType: 'luminance' }} maskUnits='userSpaceOnUse' x='0' y='0' width='240' height='300'>
                    <path d='M240 0H0V300H240V0Z' fill='white'/>
                  </mask>
                  <g mask='url(#mask0_opencode)'>
                    <path d='M180 240H60V120H180V240Z' fill='#CFCECD'/>
                    <path d='M180 60H60V240H180V60ZM240 300H0V0H240V300Z' fill='#211E1E'/>
                  </g>
                </g>
                <defs>
                  <clipPath id='clip0_opencode'>
                    <rect width='240' height='300' fill='white'/>
                  </clipPath>
                </defs>
              </svg>
              OpenCode
            </span>
          </div>
          <p className="text-base text-gray-500 dark:text-gray-500">
            Secure self-hosted tunnel · iPhone & Apple Watch
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-600 mt-4 text-center max-w-md">
            * Claude Code is a product of Anthropic. Cursor is a product of Anysphere Inc.
            OpenCode is an open-source project. All products belong to their respective owners.
          </p>
        </div>
      </section>
    </>
  );
}
