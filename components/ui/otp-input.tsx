"use client"

import { useState, useEffect, useCallback } from "react"
import type { ClipboardEvent, FormEvent, KeyboardEvent, SVGProps } from "react"
import { AnimatePresence, motion, useAnimationControls } from "framer-motion"
import type { Transition } from "framer-motion"
import { ChevronRight } from "lucide-react"

const CheckIcon = ({ size = 16, strokeWidth = 3, ...props }: SVGProps<SVGSVGElement> & { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
)

const OTPSuccess = () => {
  return (
    <div className="flex flex-col items-center justify-center gap-4 w-full py-8">
      <motion.div
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.3, type: "spring", stiffness: 500, damping: 30 }}
        className="w-16 h-16 bg-green-500 ring-4 ring-green-100 text-white flex items-center justify-center rounded-full"
      >
        <CheckIcon size={32} strokeWidth={3} />
      </motion.div>
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.4 }}
        className="text-green-600 font-semibold text-lg"
      >
        تایید شد!
      </motion.p>
    </div>
  )
}

type OTPState = "idle" | "error" | "success"

interface OTPInputBoxProps {
  index: number
  verifyOTP: () => Promise<void>
  state: OTPState
  isExpired: boolean
}

const OTPInputBox = ({ index, verifyOTP, state, isExpired }: OTPInputBoxProps) => {
  const animationControls = useAnimationControls()
  const noDelaySpringTransition: Transition = { type: "spring", stiffness: 700, damping: 20 }

  useEffect(() => {
    const springTransition: Transition = { type: "spring", stiffness: 700, damping: 20, delay: index * 0.05 }
    animationControls.start({ opacity: 1, y: 0, transition: springTransition })
    return () => animationControls.stop()
  }, [animationControls, index])

  const onFocus = () => animationControls.start({ y: -5, transition: noDelaySpringTransition })
  const onBlur = () => animationControls.start({ y: 0, transition: noDelaySpringTransition })

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const { value } = e.currentTarget
    if (e.key === "Backspace" && !value && index > 0) {
      document.getElementById(`input-${index - 1}`)?.focus()
    } else if (e.key === "ArrowLeft" && index > 0) {
      document.getElementById(`input-${index - 1}`)?.focus()
    } else if (e.key === "ArrowRight" && index < 4) {
      document.getElementById(`input-${index + 1}`)?.focus()
    }
  }

  const onInput = (e: FormEvent<HTMLInputElement>) => {
    const { value } = e.currentTarget
    if (value.match(/^[0-9]$/)) {
      e.currentTarget.value = value
      if (index < 4) document.getElementById(`input-${index + 1}`)?.focus()
    } else {
      e.currentTarget.value = ""
    }
    verifyOTP()
  }

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const pastedData = e.clipboardData.getData("text").trim().slice(0, 5)
    const digits = pastedData.split("").filter((char) => /^[0-9]$/.test(char))
    digits.forEach((digit, i) => {
      const targetIndex = index + i
      if (targetIndex < 5) {
        const input = document.getElementById(`input-${targetIndex}`) as HTMLInputElement | null
        if (input) input.value = digit
      }
    })
    const nextFocusIndex = Math.min(index + digits.length, 4)
    document.getElementById(`input-${nextFocusIndex}`)?.focus()
    setTimeout(verifyOTP, 0)
  }

  return (
    <motion.div
      className={`w-12 h-14 md:w-14 md:h-16 rounded-lg ring-2 focus-within:shadow-inner overflow-hidden transition-all duration-300 ${
        state === "error" ? "ring-red-400" : state === "success" ? "ring-green-500" : "focus-within:ring-[#06c9db] ring-[#72BFC6] ring-2"
      }`}
      initial={{ opacity: 0, y: 10 }}
      animate={animationControls}
    >
      <input
        id={`input-${index}`}
        type="text"
        inputMode="numeric"
        maxLength={1}
        onInput={onInput}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onFocus={onFocus}
        onBlur={onBlur}
        className="w-full h-full text-center text-2xl md:text-3xl font-semibold outline-none bg-transparent text-slate-800"
        disabled={state === "success" || isExpired}
      />
    </motion.div>
  )
}

export function OTPVerification({ phoneNumber, onVerify, onResend, onBack }: { 
  phoneNumber: string; 
  onVerify: (code: string) => Promise<boolean>; 
  onResend: () => Promise<void>; 
  onBack: () => void; 
}) {
  const [state, setState] = useState<OTPState>("idle")
  const [countdown, setCountdown] = useState(60)
  const isExpired = countdown <= 0
  const animationControls = useAnimationControls()

  useEffect(() => {
    if (isExpired) return
    const timer = setInterval(() => setCountdown((prev) => prev - 1), 1000)
    return () => clearInterval(timer)
  }, [isExpired])

  const getCode = () => {
    let code = ""
    for (let i = 0; i < 5; i++) {
      const input = document.getElementById(`input-${i}`) as HTMLInputElement
      if (input) code += input.value
    }
    return code
  }

  const errorAnimation = useCallback(async () => {
    setState("error")
    await animationControls.start({ x: [0, 5, -5, 5, -5, 0], transition: { duration: 0.3 } })
    setTimeout(() => { if (getCode().length < 5) setState("idle") }, 500)
  }, [animationControls])

  const verifyOTP = useCallback(async () => {
    const code = getCode()
    if (code.length < 5) {
      setState("idle")
      return
    }
    const isSuccess = await onVerify(code)
    if (isSuccess) {
      setState("success")
    } else {
      await errorAnimation()
    }
  }, [errorAnimation, onVerify])

  const handleResend = async () => {
    await onResend()
    for (let i = 0; i < 5; i++) {
      const input = document.getElementById(`input-${i}`) as HTMLInputElement
      if (input) input.value = ""
    }
    setState("idle")
    setCountdown(60)
  }

  return (
    <div className="flex flex-col items-center w-full relative">
      
      {/* دکمه تغییر شماره (جایگزین دکمه بازگشت) */}
      <button 
        onClick={onBack} 
        disabled={!isExpired}
        className={`absolute -top-4 right-0 flex items-center gap-1 text-sm font-bold transition-colors ${isExpired ? 'text-[#009BB2] hover:text-[#007A8D]' : 'text-gray-400 cursor-not-allowed'}`}
      >
        <ChevronRight size={18} strokeWidth={2.5} />
        تغییر شماره
      </button>

      <h1 className="text-md md:text-xl font-bold text-slate-800 mb-2 mt-4">
        {state === "success" ? "تایید شماره موفقیت آمیز بود" : "کد تایید را وارد کنید"}
      </h1>
      <p className="mb-4 text-sm text-slate-500" dir="ltr">{phoneNumber}</p>

      <AnimatePresence mode="wait">
        {state === "success" ? (
          <motion.div key="success" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="w-full">
            <OTPSuccess />
          </motion.div>
        ) : (
          <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full flex flex-col items-center">
            
            {/* متن شماره تلفن حذف شد */}

            {/* اضافه شدن dir="ltr" برای چپ به راست شدن ورودی‌ها */}
            <div className="flex flex-col items-center justify-center gap-2 mb-8 relative h-20" dir="ltr">
              <motion.div animate={animationControls} className="flex items-center justify-center gap-2 md:gap-3">
                {Array.from({ length: 5 }).map((_, index) => (
                  <OTPInputBox key={`input-${index}`} index={index} verifyOTP={verifyOTP} state={state} isExpired={isExpired} />
                ))}
              </motion.div>
              <AnimatePresence>
                {state === "error" && (
                  <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="text-center text-red-500 font-medium mt-2 absolute -bottom-6 w-full">
                    کد اشتباه است.
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            <div className="text-center min-h-[40px]">
              {isExpired ? (
                <button onClick={handleResend} className="font-bold text-[#009BB2] hover:text-[#007A8D] transition-colors">
                  ارسال مجدد کد
                </button>
              ) : (
                <div className="flex flex-col items-center gap-1">
                  <span className="text-slate-500 text-sm">ارسال مجدد کد تا</span>
                  <span className="font-bold text-slate-700 text-lg">{countdown} ثانیه</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
