import { useNavigate } from "react-router-dom"
import { MapPinOff } from "lucide-react"
import { EmptyState } from "@/components/common/EmptyState"
import { useDocumentTitle } from "@/hooks/use-document-title"

const NotFound = () => {
  const navigate = useNavigate()
  useDocumentTitle("Page not found")

  return (
    <EmptyState
      icon={MapPinOff}
      title="Page not found"
      description="The page you're looking for doesn't exist or has been moved."
      actionLabel="Back to dashboard"
      onAction={() => navigate("/")}
      className="min-h-[60vh]"
    />
  )
}

export default NotFound
