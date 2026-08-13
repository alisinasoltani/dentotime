'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getPublicDoctorPreview } from '@/lib/public-doctors';
import { PublicDoctor } from '@/lib/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Heart, Star, Stethoscope } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export default function DoctorsPreview() {
  const [doctors, setDoctors] = useState<PublicDoctor[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchDoctors = async () => {
      try {
        setDoctors(await getPublicDoctorPreview());
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchDoctors();
  }, []);

  return (
    <section className="w-full py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto" dir="rtl">
      <div className="flex justify-between items-center mb-10">
        <h2 className="text-2xl md:text-3xl font-bold text-slate-900">پزشکان ما</h2>
        <Link href="/doctors" className="text-sm font-bold text-[#2993A3] hover:text-[#1f7b89]">
          مشاهده همه
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
              <Skeleton className="w-16 h-16 rounded-full mx-auto mb-4" />
              <Skeleton className="h-4 w-3/4 mx-auto mb-2" />
              <Skeleton className="h-3 w-1/2 mx-auto" />
            </div>
          ))
        ) : (
          doctors.map((doc) => (
            <Link 
              href={`/doctors/${doc.id}`} 
              key={doc.id} 
              className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col items-center text-center transition-all hover:shadow-md hover:-translate-y-1"
            >
              <Avatar className="w-20 h-20 mb-4 border-2 border-[#5FB4FF]">
                <AvatarImage src={doc.profile_picture || undefined} />
                <AvatarFallback className="bg-[#E9F5F9] text-[#2993A3]">
                  <Stethoscope className="w-8 h-8" />
                </AvatarFallback>
              </Avatar>
              <h3 className="font-bold text-slate-800 mb-1">دکتر {doc.first_name} {doc.last_name}</h3>
              <p className="text-xs text-gray-500 mb-3">{doc.specialty || "متخصص دندانپزشکی"}</p>
              <div className="flex items-center gap-1 text-sm font-bold text-[#2993A3]">
                <Heart className="w-4 h-4" fill="currentColor" />
                {doc.likes_count || 0} لایک
              </div>
              <div className="mt-1 flex items-center gap-1 text-xs font-semibold text-yellow-600">
                <Star className="h-3.5 w-3.5" fill="currentColor" />
                {doc.average_rating.toFixed(1)} ({doc.vote_count} رأی)
              </div>
            </Link>
          ))
        )}
      </div>
    </section>
  );
}
