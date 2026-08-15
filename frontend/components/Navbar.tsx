'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import Image from 'next/image';

const navLinks = [
  { name: 'صفحه اصلی', href: '/' },
  { name: 'خدمات', href: '/#services' },
  { name: 'ثبت نوبت', href: '/#slots' },
  { name: 'تماس با ما', href: '/#contact' },
];

export default function Navbar() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full bg-white/70 backdrop-blur-md border-b border-white/20 shadow-sm transition-all duration-300">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        
        {/* Right side (RTL Start) - Logo */}
        <div className="flex shrink-0 items-center">
          <Link href="/">
            <div className="flex h-12 w-12 items-center justify-center rounded-full">
              <Image src={"/images/logo.png"} width={58} height={58} alt='' />
            </div>
          </Link>
        </div>

        {/* Center - Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-8 font-medium">
          {navLinks.map((link) => (
            <Link 
              key={link.name} 
              href={link.href}
              className="text-slate-700 hover:text-[#2993A3] transition-colors"
            >
              {link.name}
            </Link>
          ))}
        </nav>

        {/* Left side (RTL End) - Desktop Actions */}
        <div className="hidden md:flex items-center gap-6">
          <Link 
            href="/login" 
            className="font-medium text-slate-700 hover:text-[#2993A3] transition-colors"
          >
            ورود
          </Link>
          <Link 
            href="#contact" 
            className="rounded-full bg-[linear-gradient(90deg,#2993A3_0%,#75C1C7_100%)] px-6 py-2.5 text-sm font-bold text-white shadow-md transition-transform hover:scale-105 hover:shadow-lg"
          >
            درخواست مشاوره
          </Link>
        </div>

        {/* Mobile Menu Toggle Button */}
        <button 
          className="md:hidden p-2 text-slate-700"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          aria-label="Toggle menu"
        >
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Menu Dropdown */}
      {isMobileMenuOpen && (
        <div className="md:hidden absolute top-20 left-0 w-full bg-white/95 backdrop-blur-lg border-b border-slate-100 px-4 py-6 shadow-xl flex flex-col gap-4">
          {navLinks.map((link) => (
            <Link 
              key={link.name} 
              href={link.href}
              onClick={() => setIsMobileMenuOpen(false)}
              className="block text-lg font-medium text-slate-700 p-2 hover:bg-slate-50 rounded-lg"
            >
              {link.name}
            </Link>
          ))}
          <hr className="border-slate-100 my-2" />
          <Link 
            href="/login" 
            onClick={() => setIsMobileMenuOpen(false)}
            className="block text-lg font-medium text-slate-700 p-2"
          >
            ورود
          </Link>
          <Link 
            href="#contact" 
            onClick={() => setIsMobileMenuOpen(false)}
            className="hidden md:inline-flex mt-2 w-fit items-center justify-center rounded-full bg-[linear-gradient(90deg,#2993A3_0%,#75C1C7_100%)] px-6 py-3 text-base font-bold text-white shadow-md"
          >
            درخواست مشاوره
          </Link>
        </div>
      )}
    </header>
  );
}