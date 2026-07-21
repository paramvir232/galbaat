export default function BrandMark({ className = "w-[100px] sm:w-[150px] h-auto" }) {
  return <img src="/talkitiv-logo.png" alt="Talkietiv" className={`brand-mark shrink-0 object-contain ${className}`} />;
}
