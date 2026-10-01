import { Loader2 } from "lucide-react"

const Loader = () => {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
      <p>Loading...</p>
    </div>
  )
}

export default Loader
