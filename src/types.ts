/** Video meeting from the archive listing */
export interface VideoMeeting {
  key: number
  date: string
  chamber: 'S' | 'H' | 'J'
  committeeName: string
  duration: string
  partNumber: number
  videoUrl: string
  downloadUrls: string[]
  agendaUrl?: string
}

/** Response from POST archives.php op=loadvid */
export interface VideoLoadResult {
  parts: string[]
  reference: string
  poster?: string
  message: string
  meetingactive: boolean
  meetingstatus: string
  meetingtime: string
  meetingtitle: string
  meetinginfo: string
  chamber: string
  committee: string
  code: number
  draftquality: boolean
  key: number
  part: number
  time: string
  captions: number
  transcript: number
  orderby: string
}

/** RSS/podcast feed for a committee */
export interface CommitteeFeed {
  committeeId: string
  committeeName: string
  chamber: 'S' | 'H'
  feedUrl: string
  itunesVideoId?: string
  itunesAudioId?: string
}

/** Upcoming video broadcast */
export interface VideoScheduleEntry {
  room: string
  committee: string
  chamber: string
  time: string
  date: string
  streamUrl?: string
}

/** Committee meeting from the schedule page */
export interface Meeting {
  date: string
  time: string
  committee: string
  chamber: 'S' | 'H' | 'J'
  room: string
  billsOnAgenda: string[]
  agendaUrl?: string
}

/** Bill action from status activity report */
export interface StatusActivity {
  billNumber: string
  title: string
  action: string
  actionDate: string
  chamber: 'S' | 'H'
}

/** Floor calendar entry */
export interface CalendarEntry {
  billNumber: string
  title: string
  order: number
  status?: string
}

/** Newly introduced bill */
export interface Introduction {
  billNumber: string
  title: string
  primarySponsor: string
  chamber: 'S' | 'H'
  dateIntroduced: string
}

/** Committee with members */
export interface Committee {
  name: string
  abbreviation: string
  chamber: 'S' | 'H'
  members: CommitteeMember[]
}

export interface CommitteeMember {
  name: string
  memberCode: string
  role: 'Chair' | 'Vice Chair' | 'Member'
}

/** Full legislator profile */
export interface MemberDetail {
  name: string
  memberCode: string
  district: string
  party: string
  chamber: 'S' | 'H'
  photoUrl: string
  bio: string
  address: string
  phone: string
  email: string
  committees: string[]
  districtMapUrl?: string
}

/** Legislator search result */
export interface LegislatorResult {
  name: string
  chamber: 'S' | 'H'
  district: string
  party?: string
  memberCode?: string
}

/** County delegation member */
export interface DelegationMember {
  name: string
  chamber: 'S' | 'H'
  district: string
  role?: string
  memberCode?: string
}
