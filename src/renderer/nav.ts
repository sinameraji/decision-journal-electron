import {
  FileText,
  PlusCircle,
  Clock,
  BarChart3,
  MessageSquare,
  Settings as SettingsIcon
} from 'lucide-react'

export const NAV = [
  { to: '/decisions', label: 'Decisions', Icon: FileText },
  { to: '/new', label: 'New Decision', Icon: PlusCircle },
  { to: '/reviews', label: 'Reviews', Icon: Clock },
  { to: '/analytics', label: 'Analytics', Icon: BarChart3 },
  { to: '/chat', label: 'Chat', Icon: MessageSquare },
  { to: '/settings', label: 'Settings', Icon: SettingsIcon }
] as const
