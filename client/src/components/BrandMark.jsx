export default function BrandMark({ className = "w-[140px] sm:w-[170px] h-auto" }) {
  return <img src="/talkitiv-logo.png" alt="Talkietiv" className={`brand-mark shrink-0 object-contain ${className}`} />;
}
