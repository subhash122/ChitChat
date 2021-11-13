import { HttpClient } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { UserService } from '../user.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
})
export class LoginComponent implements OnInit {
  public email = '';
  public password = '';
  constructor(
    private http: HttpClient,
    private userService: UserService,
    private router: Router
  ) { }

  ngOnInit(): void { }
  public handleClick(): void {
    const authInfo = {
      email: this.email,
      password: this.password,
    };
    this.http.post('/api/auth/login', authInfo).subscribe((data) => {
      this.userService.currentUserInfo = data;
      this.email = '';
      this.password = '';
      this.router.navigateByUrl('/')
    });
  }
  public routeToRegister(): void {
    this.router.navigateByUrl('/register');
  }
}
