import {
  FileText,
  PlusCircle,
  Clock,
  BarChart3,
  MessageSquare,
  Brain,
  Users,
  Settings as SettingsIcon
} from 'lucide-react'

export const NAV = [
  { to: '/decisions', label: 'Decisions', Icon: FileText },
  { to: '/new', label: 'New Decision', Icon: PlusCircle },
  { to: '/reviews', label: 'Reviews', Icon: Clock },
  { to: '/analytics', label: 'Analytics', Icon: BarChart3 },
  { to: '/chat', label: 'Chat', Icon: MessageSquare },
  { to: '/memory', label: 'Memory', Icon: Brain },
  { to: '/role-models', label: 'Role Models', Icon: Users },
  { to: '/settings', label: 'Settings', Icon: SettingsIcon }
] as const
