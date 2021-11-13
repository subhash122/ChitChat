import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class UserService {
  public currentUser$: Observable<Object>;
  private currentUser: BehaviorSubject<Object | null> = new BehaviorSubject(null);

  constructor() {
    this.currentUser$ = this.currentUser.asObservable();
  }
  public set currentUserInfo(user) {
    this.currentUser.next(user);
  }
}
