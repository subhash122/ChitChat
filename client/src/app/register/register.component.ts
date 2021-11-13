import { Router } from '@angular/router';
import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-register',
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.css'],
})
export class RegisterComponent implements OnInit {
  public username: string = '';
  public email: string = '';
  public password: string = '';
  public passwordAgain: string = '';

  constructor(private http: HttpClient, private router: Router) { }
  ngOnInit(): void { }

  public handleClick() {
    if (this.passwordAgain !== this.password) {
      alert("password doesn't match");
    } else {
      const user = {
        username: this.username,
        email: this.email,
        password: this.password,
      };

      this.http.post('/api/auth/register', user).subscribe(
        (data) => {
          alert('Account created successfully,Please login.');
          this.username = '';
          this.email = '';
          this.password = '';
          this.passwordAgain = '';
        },
        (err) => {
          alert("something went wrong. please try again");
        }
      );
    }
  }
  public routeToLogin(): void {
    this.router.navigateByUrl('/login')
  }
}
