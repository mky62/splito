export interface BillItem {
  name: string
  price: number
  type?: 'item' | 'tax' | 'discount'
}

export interface LocalBillItem extends BillItem {
  id: string
}

export interface ExtractResponse {
  success: boolean
  items: BillItem[]
  currency: string
  total: number
  bill_id: string
  share_url: string
}

export interface UserSplit {
  name: string
  total: number
  items?: { name: string; price: number; share: number; type: string }[]
}

export interface ItemSplit {
  name: string
  price: number
  type?: string
  splitAmong: number | 'all'
  sharePerUser: number
  selectors: { userId: string; share: number }[]
}

export interface SplitResponse {
  allSubmitted: boolean
  currency: string
  numUsers?: number
  users?: Record<string, UserSplit>
  items?: ItemSplit[]
  total?: number
  numSubmitted?: number
  expectedUsers?: number
}

export interface SetPeopleRequest {
  totalPeople: number
}
